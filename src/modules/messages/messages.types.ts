import { ConversationWorkflowState } from '../conversation/conversation.types';

export type ConversationChannel = 'webchat' | 'whatsapp' | 'instagram' | 'sms';
export type ConversationStatus = 'active' | 'waiting_customer' | 'human_handoff' | 'closed';
export type MessageRole = 'customer' | 'assistant' | 'system';

export interface Conversation {
  id: string;
  organizationId: string;
  customerId: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  workflowState?: ConversationWorkflowState | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  organizationId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateConversationInput {
  customerId?: string | null;
  channel?: ConversationChannel;
  status?: ConversationStatus;
}

export interface CreateMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}
