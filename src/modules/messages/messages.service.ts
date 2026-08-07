import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { verifyOrganizationAccess } from '@/security/auth';
import { logger } from '@/logging/logger';
import {
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  CreateMessageInput,
  ConversationStatus
} from './messages.types';

/**
 * Lists active or all conversations for a tenant under strict RLS verification.
 */
export async function listConversations(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  statusFilter?: ConversationStatus
): Promise<Conversation[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  let query = client
    .from('conversations')
    .select('*')
    .eq('organization_id', access.organizationId)
    .order('updated_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Failed to fetch conversations', { error: error.message, organizationSlug });
    throw new Error(`Errore durante il recupero delle conversazioni: ${error.message}`);
  }

  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id || null,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Retrieves a single conversation by ID under RLS.
 */
export async function getConversation(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  conversationId: string
): Promise<Conversation | null> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return null;

  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('id', conversationId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    customerId: data.customer_id || null,
    channel: data.channel,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Creates a new conversation and emits an audit event.
 */
export async function createConversation(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  input: CreateConversationInput,
  correlationId: string
): Promise<{ success: boolean; data?: Conversation; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) {
    return { success: false, error: 'Accesso negato al tenant specificato per la conversazione.' };
  }

  const insertPayload = {
    organization_id: access.organizationId,
    customer_id: input.customerId || null,
    channel: input.channel || 'webchat',
    status: input.status || 'active',
  };

  const { data: created, error } = await client
    .from('conversations')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error || !created) {
    logger.error('Failed to create conversation', { error: error?.message, organizationSlug, correlationId });
    return { success: false, error: `Impossibile avviare la conversazione: ${error?.message}` };
  }

  // Audit log tracking
  await recordAuditLog({
    organizationId: access.organizationId,
    actorUserId: userId,
    actorType: 'user',
    action: 'CREATE_CONVERSATION',
    entityType: 'conversation',
    entityId: created.id,
    afterData: { ...insertPayload },
    correlationId,
  }, adminClient);

  return {
    success: true,
    data: {
      id: created.id,
      organizationId: created.organization_id,
      customerId: created.customer_id || null,
      channel: created.channel,
      status: created.status,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    },
  };
}

/**
 * Lists all messages in a conversation in chronological order under RLS verification.
 */
export async function listMessages(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  conversationId: string
): Promise<ConversationMessage[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to list messages', { error: error.message, conversationId });
    throw new Error(`Errore durante il recupero dei messaggi: ${error.message}`);
  }

  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}

/**
 * Creates and appends a message to a conversation under RLS and Audit tracking.
 */
export async function createMessage(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  input: CreateMessageInput,
  correlationId: string
): Promise<{ success: boolean; data?: ConversationMessage; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) {
    return { success: false, error: 'Permessi insufficienti per inviare messaggi in questo tenant.' };
  }

  const insertPayload = {
    organization_id: access.organizationId,
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content.trim(),
    metadata: input.metadata || {},
  };

  const { data: created, error } = await client
    .from('messages')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error || !created) {
    logger.error('Failed to insert message', { error: error?.message, correlationId });
    return { success: false, error: `Impossibile registrare il messaggio: ${error?.message}` };
  }

  // Record audit log for system/assistant mutations or critical turns
  await recordAuditLog({
    organizationId: access.organizationId,
    actorUserId: userId,
    actorType: input.role === 'assistant' ? 'system' : 'user',
    action: 'CREATE_MESSAGE',
    entityType: 'message',
    entityId: created.id,
    afterData: { conversation_id: input.conversationId, role: input.role, contentLength: input.content.length },
    correlationId,
  }, adminClient);

  return {
    success: true,
    data: {
      id: created.id,
      organizationId: created.organization_id,
      conversationId: created.conversation_id,
      role: created.role,
      content: created.content,
      metadata: created.metadata || {},
      createdAt: created.created_at,
    },
  };
}
