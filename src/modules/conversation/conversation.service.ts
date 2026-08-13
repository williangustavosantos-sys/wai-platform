import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';
import { getAssistantConfig } from '@/modules/assistant/assistant.service';
import { createConversation, listMessages, createMessage } from '@/modules/messages/messages.service';
import { GeminiAIProvider } from '@/modules/ai/gemini_ai_provider';
import { AIProviderContext, ConversationWorkflow, extractCustomerPhone, LocalIntentRouter, RoutedEntities } from '@/modules/ai/local_intent_router';
import { DeterministicResponseGenerator } from '@/modules/ai/deterministic_response_generator';
import { ToolResultSummary } from '@/modules/ai/ai.types';
import { executeToolByName, DEFINED_TOOLS } from '@/modules/tools/tools.service';
import { listServices, listProfessionals } from '@/modules/calendar/calendar.service';
import { listCustomers, normalizePhoneNumber } from '@/modules/crm/crm.service';
import { verifyOrganizationAccess } from '@/security/auth';
import { ConversationTurnResult, ChannelAdapter, ToolCallTelemetry, TrustedConversationContext } from './conversation.types';
import { resolveCustomerLanguage } from './customer_language';

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
    const route = router.route(message.content, { ...context, workflow });
    const entities = workflowEntities(route.entities);
    const hasEntities = Object.keys(entities).length > 0;

    if (route.intent === 'RESCHEDULE_APPOINTMENT') {
      workflow = { intent: 'RESCHEDULE_APPOINTMENT', entities: { ...(workflow?.entities || {}), ...entities } };
    } else if (route.intent === 'CHECK_AVAILABILITY' || route.intent === 'CREATE_APPOINTMENT') {
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

  // 3. Persistir mensagem do cliente (Role: 'customer') sob auditoria/RLS
  const customerMessage = await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'customer',
    content: messageData.text,
    metadata: { channel: channelAdapter.channelName }
  }, correlationId);
  if (!customerMessage.success) {
    throw new Error(customerMessage.error || 'Impossibile registrare il messaggio del cliente.');
  }

  // 4. Carregar contexto da empresa (Configurazione Assistente e Cronologia Messaggi)
  const [config, history] = await Promise.all([
    getAssistantConfig(client, adminClient, userId, organizationSlug, correlationId),
    listMessages(client, userId, organizationSlug, conversationId)
  ]);

  // 5. Invocar Motor Abstrato de Inteligência Artificial
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
    isOwner: isOrganizationStaff
  };
  const workflow = deriveConversationWorkflow(workflowHistory, localRouter, baseContext);
  const context: AIProviderContext = { ...baseContext, workflow };

  const localRoute = localRouter.route(messageData.text, context);
  
  let detectedIntent = localRoute.intent;
  let rawToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let providerName = 'LocalIntentRouter';

  const isOfflineMode = !process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OFFLINE_AI_TEST === 'true';

  if (localRoute.confidence > 0.8 && !localRoute.needsClarification) {
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

  // 6. Execução Transacional das Ferramentas com Proteção Anti-Overlap GIST e CRM
  const telemetry: ToolCallTelemetry[] = [];
  const toolResults: ToolResultSummary[] = [];
  let resolvedCustomerId: string | undefined = verifiedCustomer?.id;

  for (const call of rawToolCalls) {
    const t0 = Date.now();
    const resolvedArgs = { ...call.args };

    if (call.name === 'createAppointment' && (resolvedArgs.serviceId === 'AUTO_PRIMARY' || !resolvedArgs.serviceId)) {
      resolvedArgs.serviceId = services[0]?.id || '';
    }
    if (call.name === 'createAppointment' && (resolvedArgs.professionalId === 'AUTO_PRIMARY' || !resolvedArgs.professionalId)) {
      resolvedArgs.professionalId = professionals[0]?.id || '';
    }

    if (call.name === 'createAppointment') {
      const availability = [...toolResults].reverse().find((result) => result.toolName === 'checkAvailability');
      const availabilityData = availability?.result && typeof availability.result === 'object'
        ? availability.result as Record<string, unknown>
        : {};
      const requestedTime = localRoute.entities.time;

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
        const errDesc = 'Nessun cliente registrato nel CRM trovabile. Indicare nome e telefono per procedere.';
        telemetry.push({ toolName: call.name, arguments: resolvedArgs, result: { success: false, error: errDesc }, executionTimeMs: Date.now() - t0 });
        toolResults.push({ toolName: call.name, success: false, error: errDesc });
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
            toolResults.push({ toolName: call.name, success: false, code: result.code, error: errDesc });
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

    if (resolvedArgs.serviceId === 'AUTO_PRIMARY') {
      const combinedText = [...history.map(m => m.content), messageData.text].join(' ').toLowerCase();
      const matchedService = services.find(s => combinedText.includes(s.name.toLowerCase()) || (combinedText.includes('fiscale') && s.name.toLowerCase().includes('fiscale')));
      resolvedArgs.serviceId = (matchedService || services[0])?.id || '';
    }

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

  // 7. Guardrails: A resposta final é sintetizada ESCLUSIVAMENTE a partir dos resultados transacionados no banco
  const deterministicGen = new DeterministicResponseGenerator();
  const finalReply = deterministicGen.generateReply(
    detectedIntent,
    toolResults,
    localRoute.entities,
    messageData.text,
    access.timezone,
    customerLanguage,
  );

  const processingTimeMs = Date.now() - startTime;
  const finalMetadata = {
    intent: detectedIntent,
    toolCalls: telemetry,
    processingTimeMs,
    provider: providerName,
    customerLanguage,
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
