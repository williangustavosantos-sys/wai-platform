import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';
import { getAssistantConfig } from '@/modules/assistant/assistant.service';
import { createConversation, listMessages, createMessage, getConversation, updateConversationWorkflowState } from '@/modules/messages/messages.service';
import { GeminiAIProvider } from '@/modules/ai/gemini_ai_provider';
import { AIProviderContext, extractCustomerPhone, LocalIntentRouter, RoutedEntities, ConversationWorkflow } from '@/modules/ai/local_intent_router';
import { DeterministicResponseGenerator } from '@/modules/ai/deterministic_response_generator';
import { ToolResultSummary } from '@/modules/ai/ai.types';
import { executeToolByName, DEFINED_TOOLS } from '@/modules/tools/tools.service';
import { listServices, listProfessionals } from '@/modules/calendar/calendar.service';
import { listCustomers, normalizePhoneNumber } from '@/modules/crm/crm.service';
import { verifyOrganizationAccess } from '@/security/auth';
import { ConversationTurnResult, ChannelAdapter, ToolCallTelemetry, TrustedConversationContext, ConversationWorkflowState, CardSelection, StructuredMessage, OperationalResult } from './conversation.types';
import { resolveCustomerLanguage } from './customer_language';
import { computeBookingFlow, BookingFlowResult, BookingFlowStep } from './booking.flow';
import { ResponseValidator } from './response.validator';
import { getOrganizationDateKey } from '@/modules/shared/organization-timezone';
import { referenceNow } from '@/modules/shared/reference-time';

/**
 * Maps a guided booking flow step to the operational outcome code that
 * callers (tests, UI) expect to find in metadata.toolCalls.
 */
function mapFlowStepToOutcomeCode(step: BookingFlowStep, availabilityResult?: ToolResultSummary): string | undefined {
  switch (step) {
    case 'SERVICE':
      return 'SERVICE_SELECTION_REQUIRED';
    case 'PROFESSIONAL':
      return 'PROFESSIONAL_SELECTION_REQUIRED';
    case 'DATE':
      // If checkAvailability already ran and returned days, treat as available;
      // otherwise the step is asking for a date.
      if (availabilityResult && availabilityResult.success) {
        return 'SLOTS_AVAILABLE';
      }
      return 'DATE_REQUIRED';
    case 'SLOTS':
      // Automatic availability lookup: available when the real calendar
      // returned slots over the search window.
      if (availabilityResult && availabilityResult.success) {
        return 'SLOTS_AVAILABLE';
      }
      return 'NO_SLOTS_AVAILABLE';
    case 'TIME':
      if (availabilityResult && availabilityResult.success) {
        return 'SLOTS_AVAILABLE';
      }
      return 'NO_SLOTS_AVAILABLE';
    case 'IDENTITY':
      return 'CUSTOMER_FULL_NAME_REQUIRED';
    case 'CONFIRMATION':
      return 'CONFIRMATION_REQUIRED';
    default:
      return undefined;
  }
}

/**
 * Maps a stored card selection to authoritative workflow entities. A card
 * click carries the exact catalog id chosen by the customer, so it must win
 * over any fuzzy text re-matching of the label (e.g. "Consulta Inicial" also
 * fuzzy-matches "Consulta Online" and would otherwise be dropped).
 */
function selectionWorkflowEntities(selection: CardSelection | undefined): NonNullable<ConversationWorkflow['entities']> {
  if (!selection) return {};
  switch (selection.type) {
    case 'service':
      return selection.id ? { service: { id: selection.id, name: selection.label || selection.id } } : {};
    case 'professional':
      return selection.id ? { professional: { id: selection.id, name: selection.label || selection.id } } : {};
    case 'date':
      return selection.id ? { date: selection.id } : {};
    case 'time':
      return selection.id ? { time: selection.id } : {};
    case 'slot':
      // A merged slot card carries date + time in one click.
      return selection.payload?.date && selection.payload?.time
        ? { date: selection.payload.date as string, time: selection.payload.time as string }
        : {};
    default:
      return {};
  }
}

function workflowEntities(entities: RoutedEntities): NonNullable<ConversationWorkflow['entities']> {
  const {
    service,
    professional,
    date,
    time,
    timePeriod,
    requestedCustomerName,
    requestedCustomerFirstName,
    requestedCustomerLastName,
    requestedCustomerPhone,
  } = entities;

  return {
    ...(service ? { service } : {}),
    ...(professional ? { professional } : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(timePeriod ? { timePeriod } : {}),
    ...(requestedCustomerName ? { requestedCustomerName } : {}),
    ...(requestedCustomerFirstName ? { requestedCustomerFirstName } : {}),
    ...(requestedCustomerLastName ? { requestedCustomerLastName } : {}),
    ...(requestedCustomerPhone ? { requestedCustomerPhone } : {}),
  };
}

function deriveConversationWorkflow(
  history: Array<{ role: string; content: string; metadata?: Record<string, unknown> }>,
  router: LocalIntentRouter,
  context: AIProviderContext,
): ConversationWorkflow | undefined {
  let workflow: ConversationWorkflow | undefined;

  for (const message of history) {
    if (message.role === 'assistant') {
      const rawToolCalls = message.metadata?.toolCalls;
      const toolCalls = Array.isArray(rawToolCalls) ? rawToolCalls as Array<Record<string, unknown>> : [];
      const completedBooking = toolCalls.some((call) => {
        if (call.toolName !== 'createAppointment') return false;
        const result = call.result as { success?: boolean; code?: string } | undefined;
        return result?.success === true && result.code === 'APPOINTMENT_CREATED';
      });
      if (completedBooking) workflow = undefined;
      continue;
    }
    if (message.role !== 'customer') continue;

    // A stored card selection is authoritative memory: it carries the exact
    // catalog id chosen by the customer. Re-routing the label through the
    // fuzzy matcher can fail on similar names ("Consulta Inicial" also matches
    // "Consulta de Retorno" / "Consulta Online"), silently losing the chosen
    // service/professional/date/time from the derived workflow.
    const selection = message.metadata?.selection as CardSelection | undefined;
    const hasStoredSelection = Boolean(
      selection
      && (selection.type === 'service'
        || selection.type === 'professional'
        || selection.type === 'date'
        || selection.type === 'time'
        || selection.type === 'slot'),
    );
    const route = router.route(message.content, { ...context, workflow });
    const entities = {
      ...workflowEntities(route.entities),
      ...selectionWorkflowEntities(selection),
    };
    const hasEntities = Object.keys(entities).length > 0;

    if (route.intent === 'RESCHEDULE_APPOINTMENT') {
      workflow = { intent: 'RESCHEDULE_APPOINTMENT', entities: { ...(workflow?.entities || {}), ...entities } };
    } else if (route.intent === 'CHECK_AVAILABILITY' || route.intent === 'CREATE_APPOINTMENT' || hasStoredSelection) {
      workflow = {
        intent: workflow?.intent === 'RESCHEDULE_APPOINTMENT' ? workflow.intent : 'CHECK_AVAILABILITY',
        entities: { ...(workflow?.entities || {}), ...entities },
      };
    } else if (workflow && hasEntities) {
      workflow = { ...workflow, entities: { ...(workflow.entities || {}), ...entities } };
    }
  }

  return workflow;
}

/**
 * Conversation Engine WAI:
 * Canal (WebChat / WhatsApp) -> RLS -> AI Provider -> Tool System -> Guardrails DB -> Resposta Persiste
 */
export async function processConversationTurn(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  channelAdapter: ChannelAdapter,
  rawPayload: unknown,
  correlationId: string,
  trustedContext?: TrustedConversationContext,
): Promise<ConversationTurnResult> {
  const startTime = Date.now();
  const logger = new Logger({ correlationId, userId, organizationSlug });

  // The Core always reconstructs the tenant and role from the authenticated
  // client. A channel payload never grants staff capability.
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, logger);
  if (!access) {
    throw new Error('Accesso negato al tenant specificato per la conversazione.');
  }

  // 1. Adapter decodifica payload e normaliza dados de entrada
  const messageData = await channelAdapter.receiveMessage(rawPayload);
  let conversationId = messageData.conversationId;

  // 2. Resolver ou criar conversa no banco (RLS por organizationSlug)
  if (!conversationId) {
    const created = await createConversation(client, adminClient, userId, organizationSlug, {
      channel: channelAdapter.channelName,
      status: 'active'
    }, correlationId);
    if (!created.success || !created.data) {
      throw new Error(created.error || 'Impossibile avviare la conversazione.');
    }
    conversationId = created.data.id;
  }

  // Load existing conversation to get persisted workflow_state
  const existingConversation = await getConversation(client, userId, organizationSlug, conversationId);
  let previousWorkflowState: ConversationWorkflowState | undefined = existingConversation?.workflowState || undefined;

  // 3. Persistir mensagem do cliente (Role: 'customer') sob auditoria/RLS
  const customerMessage = await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'customer',
    content: messageData.text,
    metadata: {
      channel: channelAdapter.channelName,
      // Persist the card selection so the booking memory can be reconstructed
      // from history (deriveConversationWorkflow) even when the workflow_state
      // column is unavailable or a write fails. Without it, a card label that
      // fuzzy-matches several catalog services is silently lost.
      ...(messageData.selection ? { selection: messageData.selection } : {}),
    }
  }, correlationId);
  if (!customerMessage.success) {
    throw new Error(customerMessage.error || 'Impossibile registrare il messaggio del cliente.');
  }

  // 4. Carregar contexto da empresa (Configuração Assistente e Cronologia Mensagens)
  const [config, history] = await Promise.all([
    getAssistantConfig(client, adminClient, userId, organizationSlug, correlationId),
    listMessages(client, userId, organizationSlug, conversationId)
  ]);

  // 5. Invocar Motor Abstraído de Inteligência Artificial
  const localRouter = new LocalIntentRouter();
  const services = await listServices(client, userId, organizationSlug);
  const professionals = await listProfessionals(client, userId, organizationSlug);
  const customers = await listCustomers(client, userId, organizationSlug);

  const currentMessageIndex = history.map(message => message.role === 'customer' && message.content === messageData.text).lastIndexOf(true);
  const workflowHistory = currentMessageIndex >= 0 ? history.slice(0, currentMessageIndex) : history;
  const previousTextPhone = [...workflowHistory]
    .reverse()
    .filter((message) => message.role === 'customer')
    .map((message) => extractCustomerPhone(message.content))
    .find((phone): phone is string => Boolean(phone));
  const suppliedPhone = messageData.customerPhone || extractCustomerPhone(messageData.text) || previousTextPhone;
  const normalizedPhone = suppliedPhone ? normalizePhoneNumber(suppliedPhone).normalized : null;
  const customerLanguage = resolveCustomerLanguage(
    messageData.text,
    workflowHistory,
    access.locale || config?.language,
  );
  const isOrganizationStaff = trustedContext?.source === 'organization_workspace'
    && (access.role === 'organization_owner' || access.role === 'organization_operator');

  const verifiedCustomer = normalizedPhone
    ? customers.find((customer) => customer.phoneNormalized === normalizedPhone)
    : undefined;

  const baseContext: AIProviderContext = {
    organization: { timezone: access.timezone },
    services,
    professionals,
    customers,
    customer: verifiedCustomer,
    isOwner: isOrganizationStaff,
    referenceTime: trustedContext?.referenceTime
  };
  const workflow = deriveConversationWorkflow(workflowHistory, localRouter, baseContext);
  const context: AIProviderContext = { ...baseContext, workflow };

  const localRoute = localRouter.route(messageData.text, context);

  let detectedIntent = localRoute.intent;
  let rawToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let providerName = 'LocalIntentRouter';
  let flowStep: BookingFlowStep | undefined;
  let structuredContent: StructuredMessage | undefined;
  let operationalResult: { type: string; data: Record<string, unknown>; language: string; criticalData: string[]; baseReplyText: string } | undefined;

  const isOfflineMode = !process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OFFLINE_AI_TEST === 'true';

  // Booking flow integration: booking.flow.ts is the sole authority for
  // CREATE_APPOINTMENT / CHECK_AVAILABILITY steps. A structured card selection
  // always drives the booking flow — even when the turn carries no free text
  // (e.g. the "Conferma" / "Modifica" actions do not classify as a booking
  // intent on their own).
  const selection: CardSelection | undefined = messageData.selection;
  const isGuidedTurn = Boolean(selection);
  const isBookingIntent = localRoute.intent === 'CREATE_APPOINTMENT'
    || localRoute.intent === 'CHECK_AVAILABILITY'
    || isGuidedTurn;
  if (isGuidedTurn) {
    if (selection?.type === 'confirm' || selection?.type === 'modify') {
      // Confirming/modifying a draft is part of creating the appointment.
      detectedIntent = 'CREATE_APPOINTMENT';
    } else if (detectedIntent !== 'CREATE_APPOINTMENT' && detectedIntent !== 'CHECK_AVAILABILITY') {
      detectedIntent = 'CHECK_AVAILABILITY';
    }
  }

  if (isBookingIntent) {
    const bookingFlowResult: BookingFlowResult = computeBookingFlow({
      intent: localRoute.intent,
      entities: localRoute.entities,
      selection,
      services,
      professionals,
      hasVerifiedCustomer: Boolean(verifiedCustomer),
      timezone: access.timezone || 'Europe/Rome',
      previousState: previousWorkflowState,
      referenceTime: trustedContext?.referenceTime,
    });

    flowStep = bookingFlowResult.step;

    if (bookingFlowResult.isBookingFlow) {
      // booking.flow.ts is the sole authority for booking tool calls: it always
      // returns the concrete calls for the decided step. The router only
      // contributes intent + entities — it never decides booking operations.
      rawToolCalls = bookingFlowResult.toolCalls;
    } else {
      rawToolCalls = localRouter.convertToToolCalls(localRoute, access.timezone);
    }
  } else if (localRoute.confidence > 0.8 && !localRoute.needsClarification) {
    logger.info('Local intent router matched with high confidence', { intent: localRoute.intent, confidence: localRoute.confidence });
    rawToolCalls = localRouter.convertToToolCalls(localRoute, access.timezone);
  } else if (isOfflineMode) {
    logger.info('Offline AI mode active or API key missing, using local deterministic fallback directly', {
      intent: localRoute.intent,
      reason: localRoute.needsClarification ? 'clarification_needed' : 'low_confidence'
    });
    detectedIntent = localRoute.intent;
    rawToolCalls = localRouter.convertToToolCalls(localRoute, access.timezone);
  } else {
    logger.info('Falling back to Gemini AI provider', { reason: localRoute.needsClarification ? 'clarification_needed' : 'low_confidence' });
    const aiProvider = new GeminiAIProvider();
    providerName = aiProvider.providerName;
    try {
      const aiOutput = await aiProvider.processTurn(
        config,
        history,
        messageData.text,
        DEFINED_TOOLS,
        organizationSlug
      );
      detectedIntent = aiOutput.detectedIntent;
      rawToolCalls = aiOutput.toolCalls;
    } catch (error) {
      logger.error('Gemini AI Provider failed, falling back to local deterministic mapping', { error });
      detectedIntent = localRoute.intent;
      rawToolCalls = localRouter.convertToToolCalls(localRoute, access.timezone);
    }
  }

  let policyDecision: { success: false; code: string } | undefined;
  if (localRoute.entities.potentiallyDangerous) {
    rawToolCalls = [];
    policyDecision = { success: false, code: 'SENSITIVE_REQUEST_DENIED' };
  } else if (localRoute.entities.conflictingActions) {
    rawToolCalls = [];
    policyDecision = { success: false, code: 'CONFLICTING_ACTIONS' };
  } else if (localRoute.entities.thirdPartyRequest && (detectedIntent === 'CANCEL_APPOINTMENT' || detectedIntent === 'RESCHEDULE_APPOINTMENT' || detectedIntent === 'CUSTOMER_INFORMATION')) {
    rawToolCalls = [];
    policyDecision = { success: false, code: 'THIRD_PARTY_ACTION_DENIED' };
  } else if (localRoute.entities.customer?.conflictsWithVerifiedCustomer) {
    rawToolCalls = [];
    policyDecision = { success: false, code: 'CUSTOMER_IDENTITY_CONFLICT' };
  }

  // A policy decision vetoes the whole turn: no guided card may be rendered and
  // no synthetic flow outcome may be reported — the safety reply wins instead.
  const blockedByPolicy = Boolean(policyDecision);

  // 6. Execução Transacional das Ferramentas com Proteção Anti-Overlap GIST e CRM
  const telemetry: ToolCallTelemetry[] = [];
  const toolResults: ToolResultSummary[] = [];
  let resolvedCustomerId: string | undefined = verifiedCustomer?.id;

  for (const call of rawToolCalls) {
    const t0 = Date.now();
    const resolvedArgs = { ...call.args };

    // Test-only clock override: the checkAvailability min-advance cutoff is
    // computed against trustedContext.referenceTime when provided, so the
    // suggested slots are deterministic under a controlled clock.
    if (call.name === 'checkAvailability' && trustedContext?.referenceTime && !resolvedArgs.referenceTime) {
      resolvedArgs.referenceTime = trustedContext.referenceTime;
    }

    // booking.flow.ts is the sole authority for service resolution: the service
    // must come from the customer (explicit mention or single-option catalog).
    // Never silently fall back to services[0] — missing service means the
    // customer must choose (SERVICE step).
    if (call.name === 'createAppointment'
      && (!resolvedArgs.serviceId || resolvedArgs.serviceId === 'AUTO_PRIMARY' || resolvedArgs.serviceId === 'AUTO_RESOLVE')) {
      const error = 'Per completare la prenotazione è necessario selezionare prima il servizio.';
      const result = { success: false, code: 'SERVICE_SELECTION_REQUIRED', error };
      telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
      toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
      continue;
    }
    // Professional resolution stays defensive (ANY / single-option catalog only).
    if (call.name === 'createAppointment' && (resolvedArgs.professionalId === 'AUTO_PRIMARY' || !resolvedArgs.professionalId)) {
      resolvedArgs.professionalId = professionals[0]?.id || '';
    }

    if (call.name === 'createAppointment') {
      const availability = [...toolResults].reverse().find((result) => result.toolName === 'checkAvailability');
      const availabilityData = availability?.result && typeof availability.result === 'object'
        ? availability.result as Record<string, unknown>
        : {};
      const requestedTime = localRoute.entities.time;

      // The calendar is authoritative for availability. When it reports no
      // bookable slots at all (closure, weekend, fully-booked day), creation
      // must be refused — never force-create on an unavailable day. Past dates
      // return an empty result (checkAvailability skips them), so the guard only
      // applies to today-or-future requests and the authoritative GIST overlap
      // check inside createAppointment still yields SLOT_OCCUPIED for past slots.
      const requestedDateStr = typeof resolvedArgs.date === 'string'
        ? resolvedArgs.date
        : (typeof resolvedArgs.startAt === 'string' ? resolvedArgs.startAt.slice(0, 10) : '');
      const isPastRequest = Boolean(requestedDateStr && requestedDateStr < getOrganizationDateKey(referenceNow(trustedContext?.referenceTime), access.timezone));
      if (!isPastRequest && availability && availability.success && availability.code === 'NO_AVAILABILITY') {
        const error = 'Nessuna fascia disponibile per il giorno richiesto.';
        const result = { success: false, code: 'NO_SLOTS_AVAILABLE', error };
        telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
        toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
        continue;
      }

      if (resolvedArgs.professionalId === 'ANY') {
        const slotDetails = Array.isArray(availabilityData.slotsDetails)
          ? availabilityData.slotsDetails as Array<Record<string, unknown>>
          : [];
        const matchingSlot = slotDetails.find((slot) => slot.time === requestedTime && typeof slot.professionalId === 'string');
        resolvedArgs.professionalId = matchingSlot?.professionalId || '';
        if (!resolvedArgs.professionalId) {
          const error = 'Non è stato possibile associare un professionista disponibile allo slot scelto.';
          const result = { success: false, code: 'PROFESSIONAL_SELECTION_REQUIRED', error };
          telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
          toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
          continue;
        }
      }
    }

    // Resolve phone for findCustomer if missing
    if (call.name === 'findCustomer' && (!resolvedArgs.phone || resolvedArgs.phone === 'RESOLVED_FROM_CRM')) {
      resolvedArgs.phone = suppliedPhone || '';
    }

    // A handoff is operational only against a concrete conversation: the tool
    // must persist the human_handoff status, so inject the resolved id here.
    if (call.name === 'handoff_to_human') {
      resolvedArgs.conversationId = conversationId;
    }

    if (call.name === 'createAppointment' && !resolvedCustomerId && !resolvedArgs.customerId) {
      const firstName = localRoute.entities.requestedCustomerFirstName;
      const lastName = localRoute.entities.requestedCustomerLastName;
      const phone = localRoute.entities.requestedCustomerPhone || suppliedPhone;

      if (!firstName || !lastName || !phone) {
        const error = 'Per prenotare è necessario indicare nome, cognome e un numero di telefono verificabile.';
        const result = { success: false, code: 'CUSTOMER_FULL_NAME_REQUIRED', error };
        telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
        toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
        continue;
      }

      const customerResult = await executeToolByName(
        'createCustomer',
        { firstName, lastName, phone },
        client,
        adminClient,
        userId,
        organizationSlug,
        correlationId,
      );
      const customerExecutionTimeMs = Date.now() - t0;
      telemetry.push({ toolName: 'createCustomer', arguments: { firstName, lastName, phone }, result: customerResult, executionTimeMs: customerExecutionTimeMs });
      toolResults.push({
        toolName: 'createCustomer',
        args: { firstName, lastName, phone },
        success: customerResult.success,
        code: customerResult.code,
        result: customerResult.result,
        error: customerResult.error,
      });

      const createdCustomer = (customerResult.result as { customer?: { id?: string } } | undefined)?.customer;
      if (!customerResult.success || !createdCustomer?.id) continue;
      resolvedCustomerId = createdCustomer.id;
    }

    // Resolve business identifiers only from verified or freshly created CRM state.
    if (resolvedArgs.customerId === 'RESOLVED_FROM_CRM' || (call.name === 'createAppointment' && !resolvedArgs.customerId)) {
      if (!resolvedCustomerId) {
        const match = normalizedPhone ? customers.find(c => c.phoneNormalized === normalizedPhone) : null;
        resolvedCustomerId = match ? match.id : undefined;
      }
      if (resolvedCustomerId) {
        resolvedArgs.customerId = resolvedCustomerId;
      } else {
        const errDesc = 'Nessun cliente registrato nel CRM trovato. Indicare nome e telefono per procedere.';
        telemetry.push({ toolName: call.name, arguments: resolvedArgs, result: { success: false, error: errDesc }, executionTimeMs: Date.now() - t0 });
        toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, error: errDesc });
        continue;
      }
    }

    if (call.name === 'cancelAppointment' || call.name === 'rescheduleAppointment') {
      if (!resolvedArgs.appointmentId || resolvedArgs.appointmentId === 'AUTO_RESOLVE' || resolvedArgs.appointmentId === 'RESOLVED_FROM_CRM') {
        if (!resolvedCustomerId) {
          const match = normalizedPhone ? customers.find(c => c.phoneNormalized === normalizedPhone) : null;
          resolvedCustomerId = match?.id;
        }
        if (!resolvedCustomerId) {
          const error = 'Per modificare o cancellare un appuntamento è necessario usare il recapito verificato del titolare.';
          const result = { success: false, code: 'CUSTOMER_IDENTITY_REQUIRED', error };
          telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
          toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
          continue;
        }
        if (resolvedCustomerId) {
          const { data: appts } = await client
            .from('appointments')
            .select('*')
            .eq('customer_id', resolvedCustomerId)
            .in('status', ['confirmed', 'held']);
          
          const activeAppointments = ((appts || []) as Array<{ id: string; start_at: string }>).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          const requestedDate = typeof resolvedArgs.date === 'string' ? resolvedArgs.date : undefined;
          const matchingDate = requestedDate ? activeAppointments.filter((appointment) => appointment.start_at.startsWith(requestedDate)) : [];
          const selectedAppointment = matchingDate[0] || activeAppointments[0];
          if (selectedAppointment) {
            resolvedArgs.appointmentId = selectedAppointment.id;
          } else {
            const errDesc = 'Nessun appuntamento attivo trovato da modificare o cancellare.';
            const result = { success: false, code: 'APPOINTMENT_NOT_FOUND', error: errDesc };
            telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
            toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error: errDesc });
            continue;
          }
        }
      }
    }

    if (call.name === 'rescheduleAppointment' && !resolvedArgs.newStartAt) {
      const error = 'Indica la nuova data e ora desiderata per riprogrammare l\'appuntamento.';
      const result = { success: false, code: 'NEW_START_REQUIRED', error };
      telemetry.push({ toolName: call.name, arguments: resolvedArgs, result, executionTimeMs: Date.now() - t0 });
      toolResults.push({ toolName: call.name, args: resolvedArgs, success: false, code: result.code, error });
      continue;
    }

    // Booking flow: AUTO_PRIMARY is only used for professional fallback (never service auto-resolve)
    if (resolvedArgs.professionalId === 'AUTO_PRIMARY') {
      resolvedArgs.professionalId = professionals[0]?.id || '';
    }

    const res = await executeToolByName(
      call.name,
      resolvedArgs,
      client,
      adminClient,
      userId,
      organizationSlug,
      correlationId
    );

    const execTime = Date.now() - t0;
    telemetry.push({
      toolName: call.name,
      arguments: resolvedArgs,
      result: res,
      executionTimeMs: execTime
    });

    toolResults.push({
      toolName: call.name,
      args: resolvedArgs,
      success: res.success,
      code: res.code,
      appointmentId: res.appointmentId,
      result: res.result,
      error: res.error,
      isGistOverlapError: res.isGistOverlapError
    });

    if ((call.name === 'findCustomer' || call.name === 'createCustomer') && res.success && res.result) {
      const custData = (res.result as { customer?: { id?: string } }).customer;
      if (custData?.id) {
        resolvedCustomerId = custData.id;
      }
    }
  }

  // For guided booking steps that don't execute tools, emit a synthetic flow
  // outcome entry so callers (UI, tests, analytics) can read the step code
  // from metadata.toolCalls — the same contract used for tool-driven outcomes.
  if (isBookingIntent && flowStep && flowStep !== 'NONE' && flowStep !== 'CREATE' && !blockedByPolicy) {
    const actionable = [...toolResults].reverse().find(r => r.toolName === 'checkAvailability');
    const flowCode = mapFlowStepToOutcomeCode(flowStep, actionable);
    if (flowCode && !toolResults.some(r => r.toolName === 'checkAvailability')) {
      telemetry.push({
        toolName: 'bookingFlow',
        arguments: { flowStep },
        result: { success: true, code: flowCode },
        executionTimeMs: 0,
      });
      toolResults.push({
        toolName: 'bookingFlow',
        args: { flowStep },
        success: true,
        code: flowCode,
        result: {},
      });
    }
  }

  // 7. Persist the new workflow state (best-effort)
  let newWorkflowState: ConversationWorkflowState | undefined;
  if (isBookingIntent && localRoute.confidence > 0.4) {
    // Reconstruct state from the booking flow result
    newWorkflowState = previousWorkflowState ? { ...previousWorkflowState } : undefined;
    if (flowStep && (isGuidedTurn || isBookingIntent)) {
      const bookingFlowResult = computeBookingFlow({
        intent: localRoute.intent,
        entities: localRoute.entities,
        selection,
        services,
        professionals,
        hasVerifiedCustomer: Boolean(verifiedCustomer),
        timezone: access.timezone || 'Europe/Rome',
        previousState: previousWorkflowState,
        referenceTime: trustedContext?.referenceTime,
      });
      newWorkflowState = { ...bookingFlowResult.state };
    }
    if (newWorkflowState) {
      newWorkflowState.step = flowStep as ConversationWorkflowState['step'];
      if (flowStep === 'CREATE' && toolResults.some(r => r.toolName === 'createAppointment' && r.success && r.code === 'APPOINTMENT_CREATED')) {
        newWorkflowState.step = 'COMPLETED';
        // Clear workflow state on successful completion
        await updateConversationWorkflowState(client, adminClient, userId, organizationSlug, conversationId, null, correlationId);
      } else {
        await updateConversationWorkflowState(client, adminClient, userId, organizationSlug, conversationId, newWorkflowState, correlationId);
      }
    }
  }

  // 8. Guardrails: generate the final reply
  const deterministicGen = new DeterministicResponseGenerator({
    organization: {
      id: access.organizationId,
      name: access.organizationName,
      timezone: access.timezone,
      settingsJson: access.settingsJson,
    },
    customer: verifiedCustomer,
    conversation: {
      id: conversationId,
      organization_id: access.organizationId,
      channel: channelAdapter.channelName,
      status: existingConversation?.status || 'active',
      created_at: existingConversation?.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    digitalEmployee: config as any,
    language: customerLanguage === 'it' ? 'it' : customerLanguage === 'en' ? 'en' : 'pt',
  });

  let finalReply: string;
  let finalStructuredContent: StructuredMessage | undefined;
  // Input for the opt-in humanization pipeline: the same deterministic DRG
  // operational result used for the reply, kept separate so the humanization
  // step can never alter metadata, outcome codes, or structured cards.
  let humanizationInput: OperationalResult | undefined;

  if (flowStep && flowStep !== 'NONE' && isBookingIntent && !blockedByPolicy) {
    // Use the flow-aware response generator for guided booking turns
    const response = deterministicGen.generateResponse(
      detectedIntent,
      {
        toolResults,
        workflowState: undefined,
        professionals,
        services,
        flowStep: flowStep!,
        turnEntities: localRoute.entities,
        userText: messageData.text,
      },
    );
    finalReply = response.baseReplyText;
    finalStructuredContent = response.structuredContent;
    operationalResult = {
      type: response.operationalResult.type,
      data: response.operationalResult.data,
      language: response.operationalResult.language,
      criticalData: response.operationalResult.criticalData,
      baseReplyText: response.operationalResult.baseReplyText,
    };
    humanizationInput = operationalResult as OperationalResult;
  } else if (!blockedByPolicy) {
    // Non-booking intents use the standard grounded reply generator. The reply
    // text is byte-identical to the legacy path (same generateReply internally);
    // the operational result is additionally built so the opt-in humanization
    // pipeline can safely rephrase it.
    const response = deterministicGen.generateResponse(
      detectedIntent,
      {
        toolResults,
        flowStep: undefined,
        turnEntities: localRoute.entities,
        userText: messageData.text,
      },
    );
    finalReply = response.baseReplyText;
    if (config?.enableAiHumanization) {
      humanizationInput = response.operationalResult;
    }
  } else {
    // Policy-blocked turns (identity conflict, third party, prompt injection,
    // sensitive requests) keep the deterministic guardrail reply — the AI never
    // rephrases security decisions.
    finalReply = deterministicGen.generateReply(
      detectedIntent,
      toolResults,
      localRoute.entities,
      messageData.text,
      access.timezone,
      customerLanguage === 'it' ? 'it' : customerLanguage === 'en' ? 'en' : 'pt',
    );
  }

  // 8b. Opt-in text humanization (never operational). The AI receives ONLY the
  // deterministic base reply text + critical data and has no tools: it can never
  // execute operations, mutate the database, or change dates/times/professionals/
  // services/prices/status. Any failure (model error, timeout, quota, empty
  // reply, validator rejection) falls back to baseReplyText — the operational
  // flow never depends on Gemini.
  let humanizationApplied = false;
  // Safety gate: humanization only runs when the deterministic result carries
  // critical facts for the validator to enforce. Turns without critical data
  // (status-only outcomes such as cancellation / no availability, or pure
  // selection prompts) keep the deterministic base text — the AI is never given
  // an unconstrained rewrite that could drift the status or meaning.
  if (config && config.enableAiHumanization && !isOfflineMode && !blockedByPolicy
    && humanizationInput && humanizationInput.criticalData.length > 0) {
    const aiProvider = new GeminiAIProvider();
    let candidate = '';
    try {
      candidate = await aiProvider.humanizeResponse(
        config,
        humanizationInput,
        config,
        organizationSlug,
        correlationId,
      );
    } catch (error) {
      logger.warn('Humanization failed; using deterministic base reply text', {
        error: error instanceof Error ? error.message : String(error),
        conversationId,
      });
      candidate = '';
    }
    let valid = false;
    try {
      const validator = new ResponseValidator();
      valid = candidate.trim().length > 0
        && validator.validate({
          humanizedText: candidate,
          baseText: humanizationInput.baseReplyText,
          operationalResult: humanizationInput,
        });
    } catch (error) {
      // A validator exception (e.g. malformed critical data) must never take
      // the operational flow down: fall back to the deterministic base text.
      logger.warn('ResponseValidator failed; using deterministic base reply text', {
        error: error instanceof Error ? error.message : String(error),
        conversationId,
      });
      valid = false;
    }
    finalReply = valid ? candidate : humanizationInput.baseReplyText;
    humanizationApplied = valid;
    logger.info(valid ? 'Humanized reply applied' : 'Humanization rejected by validator or empty; using deterministic base reply text', {
      conversationId,
      intent: detectedIntent,
    });
  }

  const processingTimeMs = Date.now() - startTime;
  // A successfully persisted appointment ALWAYS reports BOOKING_CREATED as the
  // outcome — regardless of which tool ran last or how the intent was mapped.
  const createSucceeded = telemetry.some((t) => {
    if (t.toolName !== 'createAppointment') return false;
    const result = t.result as { success?: boolean; code?: string } | undefined;
    return result?.success === true && result?.code === 'APPOINTMENT_CREATED';
  });
  // Derive a single outcomeCode for observability/UI/tests from the operational
  // result (flow-aware turns) or the last tool result code (tool-driven turns).
  const derivedOutcomeCode = createSucceeded
    ? 'BOOKING_CREATED'
    : (operationalResult?.type
      || (telemetry.length > 0 ? (telemetry[telemetry.length - 1]?.result as any)?.code : undefined)
      || undefined);
  const finalMetadata = {
    intent: detectedIntent,
    toolCalls: telemetry,
    processingTimeMs,
    provider: providerName,
    customerLanguage,
    flowStep,
    outcomeCode: derivedOutcomeCode,
    structuredContent: finalStructuredContent,
    operationalResult,
    humanizationApplied,
    ...(policyDecision ? { policyDecision } : {}),
  };

  const assistantMessage = await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'assistant',
    content: finalReply,
    metadata: finalMetadata
  }, correlationId);
  if (!assistantMessage.success) {
    throw new Error(assistantMessage.error || 'Impossibile registrare la risposta del collaboratore digitale.');
  }

  // 9. Enviar resposta através do Canal correspondente
  await channelAdapter.sendReply(conversationId, finalReply);

  logger.info('Conversation turn completed', { conversationId, intent: detectedIntent, processingTimeMs });

  return {
    replyText: finalReply,
    detectedIntent: detectedIntent,
    toolCalls: telemetry,
    conversationId,
    processingTimeMs,
    metadata: finalMetadata
  };
}
