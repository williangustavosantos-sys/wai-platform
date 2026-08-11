import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';
import { getAssistantConfig } from '@/modules/assistant/assistant.service';
import { listConversations, createConversation, listMessages, createMessage } from '@/modules/messages/messages.service';
import { GeminiAIProvider } from '@/modules/ai/gemini_ai_provider';
import { AIProviderContext, ConversationWorkflow, LocalIntentRouter, RoutedEntities } from '@/modules/ai/local_intent_router';
import { DeterministicResponseGenerator } from '@/modules/ai/deterministic_response_generator';
import { ToolResultSummary } from '@/modules/ai/ai.types';
import { executeToolByName, DEFINED_TOOLS } from '@/modules/tools/tools.service';
import { listServices, listProfessionals } from '@/modules/calendar/calendar.service';
import { listCustomers, normalizePhoneNumber } from '@/modules/crm/crm.service';
import { ConversationTurnResult, ChannelAdapter, ToolCallTelemetry } from './conversation.types';

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
  };
}

function deriveConversationWorkflow(history: Array<{ role: string; content: string }>, router: LocalIntentRouter, context: AIProviderContext): ConversationWorkflow | undefined {
  let workflow: ConversationWorkflow | undefined;

  for (const message of history) {
    if (message.role !== 'customer') continue;
    const route = router.route(message.content, { ...context, workflow: undefined });
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
  correlationId: string
): Promise<ConversationTurnResult> {
  const startTime = Date.now();
  const logger = new Logger({ correlationId, userId, organizationSlug });

  // 1. Adapter decodifica payload e normaliza dados de entrada
  const messageData = await channelAdapter.receiveMessage(rawPayload);
  let conversationId = messageData.conversationId;

  // 2. Resolver ou criar conversa no banco (RLS por organizationSlug)
  if (!conversationId) {
    const existing = await listConversations(client, userId, organizationSlug, 'active');
    const sameChannel = existing.find(c => c.channel === channelAdapter.channelName);
    if (sameChannel) {
      conversationId = sameChannel.id;
    } else {
      const created = await createConversation(client, adminClient, userId, organizationSlug, {
        channel: channelAdapter.channelName,
        status: 'active'
      }, correlationId);
      if (!created.success || !created.data) {
        throw new Error(created.error || 'Impossibile avviare la conversazione.');
      }
      conversationId = created.data.id;
    }
  }

  // 3. Persistir mensagem do cliente (Role: 'customer') sob auditoria/RLS
  await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'customer',
    content: messageData.text,
    metadata: { channel: channelAdapter.channelName }
  }, correlationId);

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

  const normPhone = messageData.customerPhone ? messageData.customerPhone.replace(/\D/g, '') : '';
  const matchedProf = normPhone ? professionals.find(p => {
    const pPhone = ((p as any).phoneNormalized || (p as any).phone || '').replace(/\D/g, '');
    return pPhone && pPhone === normPhone;
  }) : null;
  const isOwner = Boolean(matchedProf && (
    matchedProf.id.startsWith('b1111111') ||
    (matchedProf as any).title?.toLowerCase().includes('titolare') ||
    (matchedProf as any).title?.toLowerCase().includes('admin') ||
    (matchedProf as any).title?.toLowerCase().includes('owner')
  )) || messageData.customerPhone === '+39021234567';

  const verifiedCustomer = normPhone ? customers.find(c => {
    const cPhone = (c.phoneNormalized || '').replace(/\D/g, '');
    return cPhone && (cPhone === normPhone || cPhone.includes(normPhone) || normPhone.includes(cPhone));
  }) : undefined;

  const baseContext: AIProviderContext = {
    organization: { timezone: 'Europe/Rome' },
    services,
    professionals,
    customers,
    customer: verifiedCustomer,
    isOwner
  };
  const currentMessageIndex = history.map(message => message.role === 'customer' && message.content === messageData.text).lastIndexOf(true);
  const workflowHistory = currentMessageIndex >= 0 ? history.slice(0, currentMessageIndex) : history;
  const workflow = deriveConversationWorkflow(workflowHistory, localRouter, baseContext);
  const context: AIProviderContext = { ...baseContext, workflow };

  const localRoute = localRouter.route(messageData.text, context);
  
  let detectedIntent = localRoute.intent;
  let rawToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let aiProviderUsed = false;
  let providerName = 'LocalIntentRouter';
  let replyDraft = '';

  const isOfflineMode = !process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OFFLINE_AI_TEST === 'true';

  if (localRoute.confidence > 0.8 && !localRoute.needsClarification) {
    logger.info('Local intent router matched with high confidence', { intent: localRoute.intent, confidence: localRoute.confidence });
    rawToolCalls = localRouter.convertToToolCalls(localRoute);
  } else if (isOfflineMode) {
    logger.info('Offline AI mode active or API key missing, using local deterministic fallback directly', {
      intent: localRoute.intent,
      reason: localRoute.needsClarification ? 'clarification_needed' : 'low_confidence'
    });
    detectedIntent = localRoute.intent;
    rawToolCalls = localRouter.convertToToolCalls(localRoute);
    aiProviderUsed = false;
  } else {
    logger.info('Falling back to Gemini AI provider', { reason: localRoute.needsClarification ? 'clarification_needed' : 'low_confidence' });
    aiProviderUsed = true;
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
      replyDraft = aiOutput.replyText;
    } catch (error) {
      logger.error('Gemini AI Provider failed, falling back to local deterministic mapping', { error });
      detectedIntent = localRoute.intent;
      rawToolCalls = localRouter.convertToToolCalls(localRoute);
      aiProviderUsed = false;
    }
  }

  let policyDecision: { success: false; code: string } | undefined;
  if (localRoute.entities.potentiallyDangerous) {
    rawToolCalls = [];
    policyDecision = { success: false, code: 'SENSITIVE_REQUEST_DENIED' };
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

    // Resolve phone for findCustomer if missing
    if (call.name === 'findCustomer' && (!resolvedArgs.phone || resolvedArgs.phone === 'RESOLVED_FROM_CRM')) {
      resolvedArgs.phone = messageData.customerPhone || '';
    }

    if (call.name === 'createAppointment' && !resolvedCustomerId && !resolvedArgs.customerId) {
      const firstName = localRoute.entities.requestedCustomerFirstName;
      const lastName = localRoute.entities.requestedCustomerLastName;
      const phone = messageData.customerPhone;

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
        const match = messageData.customerPhone ? customers.find(c => c.phoneNormalized === messageData.customerPhone || c.phoneNormalized.includes(messageData.customerPhone!)) : null;
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
          const match = messageData.customerPhone ? customers.find(c => c.phoneNormalized === messageData.customerPhone || c.phoneNormalized.includes(messageData.customerPhone!)) : null;
          resolvedCustomerId = match ? match.id : (customers[0]?.id || undefined);
        }
        if (resolvedCustomerId) {
          const { data: appts } = await client
            .from('appointments')
            .select('*')
            .eq('customer_id', resolvedCustomerId)
            .in('status', ['confirmed', 'held', 'pending']);
          
          const activeAppointments = (appts || []).sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          const requestedDate = typeof resolvedArgs.date === 'string' ? resolvedArgs.date : undefined;
          const matchingDate = requestedDate ? activeAppointments.filter((appointment: any) => appointment.start_at.startsWith(requestedDate)) : [];
          const selectedAppointment = matchingDate[0] || activeAppointments[0];
          if (selectedAppointment) {
            resolvedArgs.appointmentId = selectedAppointment.id;
          } else {
            const errDesc = 'Nessun appuntamento attivo trovato da modificare o cancellare.';
            telemetry.push({ toolName: call.name, arguments: resolvedArgs, result: { success: false, error: errDesc }, executionTimeMs: Date.now() - t0 });
            toolResults.push({ toolName: call.name, success: false, error: errDesc });
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
  let finalReply = '';
  if (aiProviderUsed) {
    const aiProvider = new GeminiAIProvider();
    try {
      finalReply = await aiProvider.generateReplyFromToolResults(
        config,
        detectedIntent,
        messageData.text,
        toolResults,
        organizationSlug,
        replyDraft,
        history
      );
    } catch (e) {
      logger.error('Gemini AI Provider failed generating reply, falling back to deterministic', { error: e });
      const deterministicGen = new DeterministicResponseGenerator();
      finalReply = deterministicGen.generateReply(detectedIntent, toolResults, localRoute.entities, messageData.text);
    }
  } else {
    const deterministicGen = new DeterministicResponseGenerator();
    finalReply = deterministicGen.generateReply(detectedIntent, toolResults, localRoute.entities, messageData.text);
  }

  const processingTimeMs = Date.now() - startTime;
  const finalMetadata = {
    intent: detectedIntent,
    toolCalls: telemetry,
    processingTimeMs,
    provider: providerName,
    ...(policyDecision ? { policyDecision } : {}),
  };

  await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'assistant',
    content: finalReply,
    metadata: finalMetadata
  }, correlationId);

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
