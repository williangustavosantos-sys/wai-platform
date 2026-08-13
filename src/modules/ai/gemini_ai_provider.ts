import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AIProvider, AIProviderTurnOutput, ToolResultSummary } from './ai.types';
import { DigitalEmployeeConfig } from '../assistant/assistant.types';
import { ConversationMessage } from '../messages/messages.types';
import { ToolDefinition } from '../tools/tools.types';
import { Intent } from '../conversation/conversation.types';
import { configuredCustomerLanguage, detectCustomerLanguage } from '../conversation/customer_language';
import { DeterministicResponseGenerator } from './deterministic_response_generator';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || 'dummy_key',
});

export class GeminiAIProvider implements AIProvider {
  readonly providerName = 'GeminiAIProvider (Structured Tool Calling)';

  async processTurn(
    config: DigitalEmployeeConfig | null,
    history: ConversationMessage[],
    userText: string,
    _availableTools: ToolDefinition[],
    organizationSlug: string
  ): Promise<AIProviderTurnOutput> {
    try {
        void _availableTools;
        void organizationSlug;
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
        console.error("LLM Error:", e);
        throw e;
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
      const fallback = configuredCustomerLanguage(config?.language);
      const previousCustomerText = [...(_history || [])].reverse().find((message) => message.role === 'customer')?.content;
      const previousLanguage = previousCustomerText ? detectCustomerLanguage(previousCustomerText, fallback) : fallback;
      const language = detectCustomerLanguage(userText, previousLanguage);
      const deterministic = new DeterministicResponseGenerator();
      const verifiedReply = deterministic.generateReply(intent, toolResults, undefined, userText, 'Europe/Rome', language);

      if (toolResults.length || intent !== 'UNKNOWN') return verifiedReply;
      return draftReply || verifiedReply;
  }
}
