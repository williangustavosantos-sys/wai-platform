import { ConversationChannel } from '../messages/messages.types';

export type Intent =
  | "COMPANY_INFORMATION"
  | "CHECK_AVAILABILITY"
  | "CREATE_APPOINTMENT"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "CUSTOMER_INFORMATION"
  | "OWNER_COMMAND"
  | "HUMAN_HANDOFF"
  | "UNKNOWN"
  // Legacy mappings for unit tests backward compatibility
  | "BOOK_APPOINTMENT"
  | "GENERAL_INFORMATION";

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
  metadata?: Record<string, any>;
}

/**
 * Server-only provenance for messages sent from an authenticated organization
 * workspace. It is intentionally not part of any channel payload.
 */
export interface TrustedConversationContext {
  source: 'organization_workspace';
}

export interface ChannelAdapter {
  readonly channelName: ConversationChannel;
  receiveMessage(payload: unknown): Promise<{ conversationId?: string; customerPhone?: string; text: string }>;
  sendReply(destination: string, text: string): Promise<boolean>;
}
