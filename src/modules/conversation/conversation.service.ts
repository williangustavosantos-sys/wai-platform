import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';
import { getAssistantConfig } from '@/modules/assistant/assistant.service';
import { listConversations, createConversation, listMessages, createMessage } from '@/modules/messages/messages.service';
import { SimpleAIProvider } from '@/modules/ai/simple_ai_provider';
import { ToolResultSummary } from '@/modules/ai/ai.types';
import { executeToolByName, DEFINED_TOOLS } from '@/modules/tools/tools.service';
import { listServices, listProfessionals } from '@/modules/calendar/calendar.service';
import { listCustomers } from '@/modules/crm/crm.service';
import { ConversationTurnResult, ChannelAdapter, ToolCallTelemetry } from './conversation.types';

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
  const aiProvider = new SimpleAIProvider();
  const aiOutput = await aiProvider.processTurn(
    config,
    history,
    messageData.text,
    DEFINED_TOOLS,
    organizationSlug
  );

  // 6. Execução Transacional das Ferramentas com Proteção Anti-Overlap GIST e CRM
  const telemetry: ToolCallTelemetry[] = [];
  const toolResults: ToolResultSummary[] = [];
  let resolvedCustomerId: string | undefined = undefined;

  for (const call of aiOutput.toolCalls) {
    const t0 = Date.now();
    const resolvedArgs = { ...call.args };

    // Resolver identificadores dinâmicos para a demonstração operacional do MVP
    if (resolvedArgs.customerId === 'RESOLVED_FROM_CRM') {
      if (!resolvedCustomerId) {
        const customers = await listCustomers(client, userId, organizationSlug);
        const match = messageData.customerPhone ? customers.find(c => c.phoneNormalized === messageData.customerPhone || c.phoneNormalized.includes(messageData.customerPhone!)) : null;
        resolvedCustomerId = match ? match.id : (customers[0]?.id || undefined);
      }
      if (resolvedCustomerId) {
        resolvedArgs.customerId = resolvedCustomerId;
      } else {
        // Se não encontrou, abortar tool createAppointment com mensagem explicativa
        const errDesc = 'Nessun cliente registrato nel CRM trovabile. Indicare nome e telefono per procedere.';
        telemetry.push({ toolName: call.name, arguments: resolvedArgs, result: { success: false, error: errDesc }, executionTimeMs: Date.now() - t0 });
        toolResults.push({ toolName: call.name, success: false, error: errDesc });
        continue;
      }
    }

    if (resolvedArgs.serviceId === 'AUTO_PRIMARY') {
      const services = await listServices(client, userId, organizationSlug);
      const combinedText = [...history.map(m => m.content), messageData.text].join(' ').toLowerCase();
      const matchedService = services.find(s => combinedText.includes(s.name.toLowerCase()) || (combinedText.includes('fiscale') && s.name.toLowerCase().includes('fiscale')));
      resolvedArgs.serviceId = (matchedService || services[0])?.id || '';
    }

    if (resolvedArgs.professionalId === 'AUTO_PRIMARY') {
      const profs = await listProfessionals(client, userId, organizationSlug);
      resolvedArgs.professionalId = profs[0]?.id || '';
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
      success: res.success,
      result: res.result,
      error: res.error,
      isGistOverlapError: res.isGistOverlapError
    });

    // Capturar customer ID retornado pelo CRM para próximos passos no mesmo turno
    if ((call.name === 'findCustomer' || call.name === 'createCustomer') && res.success && res.result) {
      const custData = (res.result as { customer?: { id?: string } }).customer;
      if (custData?.id) {
        resolvedCustomerId = custData.id;
      }
    }
  }

  // 7. Guardrails: A resposta final é sintetizada ESCLUSIVAMENTE a partir dos resultados transacionados no banco
  const finalReply = await aiProvider.generateReplyFromToolResults(
    config,
    aiOutput.detectedIntent,
    messageData.text,
    toolResults,
    organizationSlug,
    aiOutput.replyText,
    history,
    aiOutput.customMetadata?.bookingDraft as Record<string, any> | undefined
  );

  const processingTimeMs = Date.now() - startTime;
  const finalMetadata = {
    intent: aiOutput.detectedIntent,
    toolCalls: telemetry,
    processingTimeMs,
    provider: aiProvider.providerName,
    ...(aiOutput.customMetadata || {})
  };

  await createMessage(client, adminClient, userId, organizationSlug, {
    conversationId,
    role: 'assistant',
    content: finalReply,
    metadata: finalMetadata
  }, correlationId);

  // 9. Enviar resposta através do Canal correspondente
  await channelAdapter.sendReply(conversationId, finalReply);

  logger.info('Conversation turn completed', { conversationId, intent: aiOutput.detectedIntent, processingTimeMs });

  return {
    replyText: finalReply,
    detectedIntent: aiOutput.detectedIntent,
    toolCalls: telemetry,
    conversationId,
    processingTimeMs,
    metadata: finalMetadata
  };
}
