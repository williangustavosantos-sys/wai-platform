import { ConversationChannel } from '../messages/messages.types';

export type Intent =
  | "BOOK_APPOINTMENT"
  | "CHECK_AVAILABILITY"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "CUSTOMER_LOOKUP"
  | "GENERAL_INFORMATION"
  | "HUMAN_HANDOFF";

export interface ToolCallTelemetry {
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  executionTimeMs: number;
}

export interface ConversationTurnResult {
  replyText: string;
  detectedIntent: Intent;
  toolCalls: ToolCallTelemetry[];
  conversationId: string;
  processingTimeMs: number;
}

export interface ChannelAdapter {
  readonly channelName: ConversationChannel;
  receiveMessage(payload: unknown): Promise<{ conversationId?: string; customerPhone?: string; text: string }>;
  sendReply(destination: string, text: string): Promise<boolean>;
}
