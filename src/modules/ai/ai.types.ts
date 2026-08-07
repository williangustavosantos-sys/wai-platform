import { ConversationMessage } from '../messages/messages.types';
import { Intent } from '../conversation/conversation.types';
import { ToolDefinition } from '../tools/tools.types';
import { DigitalEmployeeConfig } from '../assistant/assistant.types';

export interface AIProviderTurnOutput {
  replyText: string;
  detectedIntent: Intent;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  customMetadata?: Record<string, unknown>;
}

export interface ToolResultSummary {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  isGistOverlapError?: boolean;
}

export interface AIProvider {
  readonly providerName: string;
  
  /**
   * Interpreta o turno do usuário, detecta o Intent e decide quais WAI Tools devem ser acionadas.
   */
  processTurn(
    config: DigitalEmployeeConfig | null,
    history: ConversationMessage[],
    userText: string,
    availableTools: ToolDefinition[],
    organizationSlug: string
  ): Promise<AIProviderTurnOutput>;

  /**
   * Constrói a resposta em linguagem natural com base unicamente nos resultados reais obtidos das WAI Tools (Guardrails).
   */
  generateReplyFromToolResults(
    config: DigitalEmployeeConfig | null,
    intent: Intent,
    userText: string,
    toolResults: ToolResultSummary[],
    organizationSlug: string,
    draftReply?: string,
    history?: ConversationMessage[],
    bookingDraft?: Record<string, any>
  ): Promise<string>;
}
