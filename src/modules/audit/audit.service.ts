import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';

export interface AuditLogPayload {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'admin' | 'ai_tool';
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  correlationId: string;
}

/**
 * Centralized Audit Logging Service.
 * Enforces strict logging of actions, before/after states, and correlation IDs.
 * FAILURE HANDLING POLICY: Audit failure is explicitly raised and NEVER silently caught or ignored.
 */
export async function recordAuditLog(
  payload: AuditLogPayload,
  client: SupabaseClient,
  logger?: Logger
): Promise<string> {
  const log = logger || new Logger({ correlationId: payload.correlationId });

  if (!payload.correlationId) {
    throw new Error('CRITICAL: Audit log cannot be recorded without an explicit correlationId.');
  }

  if (!payload.action || !payload.entityType || !payload.entityId) {
    throw new Error('CRITICAL: Audit log missing essential entity description fields.');
  }

  const record = {
    organization_id: payload.organizationId || null,
    actor_user_id: payload.actorUserId || null,
    actor_type: payload.actorType || 'user',
    action: payload.action,
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    before_data: payload.beforeData || null,
    after_data: payload.afterData || null,
    metadata: payload.metadata || {},
    correlation_id: payload.correlationId,
  };

  const { data, error } = await client
    .from('audit_logs')
    .insert([record])
    .select('id')
    .single();

  if (error || !data) {
    const errorMsg = `AUDIT FAILURE: Failed to record audit log for action ${payload.action} on ${payload.entityType}:${payload.entityId}`;
    log.error(errorMsg, { record }, error);
    throw new Error(errorMsg);
  }

  log.info(`Audit log recorded successfully`, { auditId: data.id, action: payload.action, entityId: payload.entityId });
  return data.id as string;
}
