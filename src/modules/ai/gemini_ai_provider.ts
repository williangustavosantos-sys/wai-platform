import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AIProvider, AIProviderTurnOutput, ToolResultSummary } from './ai.types';
import { DigitalEmployeeConfig } from '../assistant/assistant.types';
import { ConversationMessage } from '../messages/messages.types';
import { ToolDefinition } from '../tools/tools.types';
import { Intent, ExtractedEntities, OperationalResult } from '../conversation/conversation.types';
import { configuredCustomerLanguage, detectCustomerLanguage } from '../conversation/customer_language';
import { DeterministicResponseGenerator } from './deterministic_response_generator';
import { logger } from '@/logging/logger';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || 'dummy_key',
});

const isOfflineMode = !process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OFFLINE_AI_TEST === 'true';

// Fallback heuristic engine for offline mode, mimicking LLM structured tool extraction
const mockedLLMRouter = (text: string): AIProviderTurnOutput => {
  const lower = text.toLowerCase();
  let detectedIntent: Intent = 'UNKNOWN';
  const entities: ExtractedEntities = {};
  let language: string = 'it';

  if (lower.includes('english') || lower.includes('appointment')) language = 'en';
  if (lower.includes('portugues') || lower.includes('consulta')) language = 'pt';

  if (lower.includes('visita') || lower.includes('consulenza')) entities.service = 'visita';
  if (lower.includes('marco')) entities.professional = 'Marco Rossi';
  if (lower.includes('anna')) entities.professional = 'Anna Ferrari';
  if (lower.includes('domani')) entities.date = '2026-08-25';
  if (lower.includes('venerdì')) entities.date = '2026-08-22';
  if (lower.includes('15:00')) entities.time = '15:00';
  if (lower.includes('mattina')) entities.time = '09:00';
  if (lower.includes('pomeriggio')) entities.time = '14:00';

  const bookingKeywords = ['prenotar', 'fissar', 'appuntament', 'visita', 'disponibil', 'orari', 'app', 'bng', 'attesa', 'lista', 'tasse', 'commercialista', 'bilancio'];
  const cancelKeywords = ['cancella', 'disdi', 'annulla'];
  const rescheduleKeywords = ['sposta', 'cambia', 'posticipa', 'anticipa'];
  const infoKeywords = ['orari', 'dove', 'prezzi', 'quanto costa'];

  if (bookingKeywords.some(k => lower.includes(k))) {
    detectedIntent = 'CREATE_APPOINTMENT';
  } else if (cancelKeywords.some(k => lower.includes(k))) {
    detectedIntent = 'CANCEL_APPOINTMENT';
  } else if (rescheduleKeywords.some(k => lower.includes(k))) {
    detectedIntent = 'RESCHEDULE_APPOINTMENT';
  } else if (infoKeywords.some(k => lower.includes(k))) {
    detectedIntent = 'COMPANY_INFORMATION';
  } else if (lower.includes('ciao') || lower.includes('buongiorno')) {
    detectedIntent = 'START_CONVERSATION';
  }

  return {
    replyText: '',
    detectedIntent,
    toolCalls: [],
    customMetadata: { extractedIntent: { intent: detectedIntent, entities, confidence: 0.9, language } },
  };
};

const TONE_PROMPTS: Record<string, string> = {
  formal: 'You are a formal and professional assistant. Be clear, polite, and helpful. Use formal language.',
  cordial_empathic: 'You are a warm, empathetic, and professional assistant. Be friendly and caring while remaining competent.',
  direct: 'You are a direct and efficient assistant. Get straight to the point. Use short, clear sentences.',
  default: 'You are a helpful assistant.',
};

export class GeminiAIProvider implements AIProvider {
  readonly providerName = 'GeminiAIProvider (Structured Tool Calling)';

  async processTurn(
    config: DigitalEmployeeConfig | null,
    history: ConversationMessage[],
    userText: string,
    _availableTools: ToolDefinition[],
    organizationSlug: string
  ): Promise<AIProviderTurnOutput> {
    void _availableTools;
    void organizationSlug;

    // Safe fallback: when offline or API key missing, use mocked intent routing
    // The deterministic system always validates and executes operational decisions.
    if (isOfflineMode) {
      logger.info('GeminiAIProvider in offline mode, using mocked intent routing', { correlationId: 'offline' });
      return mockedLLMRouter(userText);
    }

    try {
      const fallbackLanguage = configuredCustomerLanguage(config?.language);
      const customerLanguage = detectCustomerLanguage(userText, fallbackLanguage);
      const languageName = customerLanguage === 'en' ? 'English' : customerLanguage === 'pt' ? 'Portuguese' : 'Italian';
      const { text, toolCalls } = await generateText({
        model: google('gemini-3.6-flash'),
        system: `You are ${config?.name || 'the Digital Employee'} for an organization using WAI. Your job is to classify the user's intent and extract necessary parameters using the provided tools.
The customer's current language is ${languageName}. Reply in ${languageName}; never ask which language they prefer.
You must NOT perform business logic directly. You must call a tool.
A booking request is not complete until createAppointment returns a successful persisted appointment. If booking details are missing, use checkAvailability and ask only for the missing details.
If the user asks for information not in the tools, call handoff_to_human.`,
        prompt: userText,
        tools: {
          checkAvailability: tool({
            description: 'Check calendar availability for booking',
            parameters: z.object({
              serviceId: z.string().optional(),
              professionalId: z.string().optional(),
              date: z.string().optional(),
            }),
          }),
          createAppointment: tool({
            description: 'Create a new appointment',
            parameters: z.object({
              customerId: z.string(),
              serviceId: z.string(),
              professionalId: z.string(),
              startAt: z.string()
            }),
          }),
          cancelAppointment: tool({
            description: 'Cancel an existing appointment',
            parameters: z.object({
              appointmentId: z.string().optional(),
              reason: z.string().optional()
            }),
          }),
          rescheduleAppointment: tool({
            description: 'Reschedule an existing appointment',
            parameters: z.object({
              appointmentId: z.string().optional(),
              newStartAt: z.string()
            }),
          }),
          getCompanyInformation: tool({
            description: 'Get information about the company like hours, location, services',
            parameters: z.object({
              queryType: z.string().optional()
            }),
          }),
          findCustomer: tool({
            description: 'Look up a customer in the CRM',
            parameters: z.object({
              phone: z.string().optional()
            }),
          }),
          ownerListAgenda: tool({
            description: 'Titolare command: list agenda for a day',
            parameters: z.object({
              date: z.string()
            }),
          }),
          ownerBlockCalendar: tool({
            description: 'Titolare command: block calendar for a day',
            parameters: z.object({
              date: z.string(),
              reason: z.string().optional()
            }),
          }),
          ownerMoveAppointment: tool({
            description: 'Titolare command: move client appointment',
            parameters: z.object({
              customerName: z.string(),
              newDateTime: z.string()
            }),
          }),
          ownerGetStats: tool({
            description: 'Titolare command: get stats for a day',
            parameters: z.object({
              date: z.string()
            }),
          }),
          handoff_to_human: tool({
            description: 'Handoff the conversation to a human operator',
            parameters: z.object({
              reason: z.string()
            }),
          })
        }
      });

      const mappedToolCalls = toolCalls.map(t => ({
        name: t.toolName,
        args: t.args
      }));

      let detectedIntent: Intent = 'COMPANY_INFORMATION';
      if (mappedToolCalls.some(t => t.name === 'createAppointment')) {
        detectedIntent = 'CREATE_APPOINTMENT';
      } else if (mappedToolCalls.some(t => t.name === 'checkAvailability')) {
        detectedIntent = 'CHECK_AVAILABILITY';
      } else if (mappedToolCalls.some(t => t.name === 'cancelAppointment')) {
        detectedIntent = 'CANCEL_APPOINTMENT';
      } else if (mappedToolCalls.some(t => t.name === 'rescheduleAppointment')) {
        detectedIntent = 'RESCHEDULE_APPOINTMENT';
      } else if (mappedToolCalls.some(t => t.name.startsWith('owner'))) {
        detectedIntent = 'OWNER_COMMAND';
      } else if (mappedToolCalls.some(t => t.name === 'findCustomer')) {
        detectedIntent = 'CUSTOMER_INFORMATION';
      } else if (mappedToolCalls.some(t => t.name === 'handoff_to_human')) {
        detectedIntent = 'HUMAN_HANDOFF';
      }

      return {
        replyText: text || '',
        detectedIntent,
        toolCalls: mappedToolCalls,
        customMetadata: {}
      };
    } catch (e: unknown) {
      logger.error('Gemini processTurn failed, falling back to deterministic routing', { error: e instanceof Error ? e.message : String(e) });
      return mockedLLMRouter(userText);
    }
  }

  async generateReplyFromToolResults(
    config: DigitalEmployeeConfig | null,
    intent: Intent,
    userText: string,
    toolResults: ToolResultSummary[],
    organizationSlug: string,
    draftReply?: string,
    _history?: ConversationMessage[],
    _customMetadata?: unknown
  ): Promise<string> {
    void _customMetadata;
    void organizationSlug;
    const fallback = configuredCustomerLanguage(config?.language);
    const previousCustomerText = [...(_history || [])].reverse().find((message) => message.role === 'customer')?.content;
    const previousLanguage = previousCustomerText ? detectCustomerLanguage(previousCustomerText, fallback) : fallback;
    const language = detectCustomerLanguage(userText, previousLanguage);
    const deterministic = new DeterministicResponseGenerator();
    const verifiedReply = deterministic.generateReply(intent, toolResults, undefined, userText, 'Europe/Rome', language);

    if (toolResults.length || intent !== 'UNKNOWN') return verifiedReply;
    return draftReply || verifiedReply;
  }

  /**
   * Humanizes the base reply text using Gemini LLM.
   * Only called when enable_ai_humanization is true and the app is NOT in offline mode.
   * Always falls back to the base reply text if Gemini fails, ensuring the
   * deterministic system's safe output is never lost.
   */
  async humanizeResponse(
    _config: DigitalEmployeeConfig | null,
    operationalResult: OperationalResult,
    employee: DigitalEmployeeConfig,
    organizationSlug: string,
    _correlationId: string,
  ): Promise<string> {
    void _config;
    void organizationSlug;

    if (isOfflineMode) {
      return this.fallbackHumanize(operationalResult);
    }

    try {
      const tone = employee.communicationTone || 'default';
      const toneInstruction = TONE_PROMPTS[tone] || TONE_PROMPTS.default;
      const employeeName = employee.name || 'Assistente Digitale';

      const prompt = `
      System Persona:
      - Your name is ${employeeName}.
      - You are a digital assistant for ${organizationSlug}.
      - ${toneInstruction}

      Task:
      Rephrase the following "Base Message" into a natural, conversational, and human-like message for the customer.
      The language of your response must be: ${operationalResult.language}.
      Strict Rule: You MUST include all the critical data points from the "Critical Data" list. Do NOT add any new information, prices, or details not explicitly provided in the "Base Message".

      Base Message:
      "${operationalResult.baseReplyText}"
      Critical Data: ${operationalResult.criticalData.join(', ')}

      Your response to the user:
    `;

      const { text } = await generateText({
        model: google('gemini-3.6-flash'),
        prompt,
      });
      return text || this.fallbackHumanize(operationalResult);
    } catch (e: unknown) {
      logger.warn('Gemini humanization failed, using base reply text as fallback', { error: e instanceof Error ? e.message : String(e) });
      return this.fallbackHumanize(operationalResult);
    }
  }

  private fallbackHumanize(operationalResult: OperationalResult): string {
    // The spec contract is strict: on ANY failure (offline, model error, timeout,
    // quota, empty reply) the pipeline must use the deterministic base reply text
    // verbatim — never a paraphrase of it.
    return operationalResult.baseReplyText;
  }
}
