import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';

export interface OrganizationSettingsUpdate {
  displayName?: string;
  themePreference?: 'institutional' | 'balanced' | 'cool';
  locale?: string;
  [key: string]: unknown;
}

/**
 * Retrieves organization details by slug with strict server-side membership verification.
 */
export async function getOrganizationBySlug(
  client: SupabaseClient,
  userId: string,
  slug: string,
  logger?: Logger
) {
  return verifyOrganizationAccess(client, userId, slug, logger);
}

/**
 * Performs a minimal, reversible configuration update on organization settings_json and locale.
 * Validates ownership role, executes under RLS, and records immutable before/after audit log.
 */
export async function updateOrganizationSettings(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  newSettings: OrganizationSettingsUpdate,
  correlationId: string,
  logger?: Logger
): Promise<{ success: boolean; updatedSettings?: Record<string, unknown>; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });

  // 1. Verify access and ensure actor is organization_owner or wai_admin
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access) {
    return { success: false, error: 'Acesso negado ou organização inexistente.' };
  }

  if (access.role !== 'organization_owner') {
    log.warn('Update rejected: User role is not organization_owner', { role: access.role });
    return { success: false, error: 'Operação permitida exclusivamente ao proprietário (owner) da organização.' };
  }

  const beforeData = { ...access.settingsJson, locale: access.locale };
  const { locale, ...settingsJsonUpdates } = newSettings;
  const afterSettingsJson = { ...access.settingsJson, ...settingsJsonUpdates };
  const afterData = { ...afterSettingsJson, locale: locale || access.locale };

  const updatePayload: Record<string, unknown> = { settings_json: afterSettingsJson };
  if (locale) {
    updatePayload.locale = locale;
  }

  // 2. Perform update using authenticated client (enforces RLS)
  const { error: updateError } = await client
    .from('organizations')
    .update(updatePayload)
    .eq('id', access.organizationId);

  if (updateError) {
    log.error('Database update failed for organization settings', { error: updateError });
    return { success: false, error: `Erro ao atualizar configurações: ${updateError.message}` };
  }

  // 3. Record audit log via central audit service (using admin client or user client to guarantee delivery)
  await recordAuditLog(
    {
      organizationId: access.organizationId,
      actorUserId: userId,
      actorType: 'user',
      action: 'UPDATE_ORGANIZATION_SETTINGS',
      entityType: 'organization',
      entityId: access.organizationId,
      beforeData,
      afterData,
      metadata: { slug: organizationSlug },
      correlationId,
    },
    adminClient,
    log
  );

  log.info('Organization settings updated and audited successfully', { organizationId: access.organizationId });
  return { success: true, updatedSettings: afterData };
}

/**
 * Server-side global organization list for wai_admin exclusively.
 */
export async function listAllOrganizationsForAdmin(adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from('organizations')
    .select('id, name, slug, timezone, locale, status, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Erro administrativo ao listar organizações: ${error.message}`);
  }

  return data || [];
}
