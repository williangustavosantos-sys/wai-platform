import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';

export interface OrganizationSettingsUpdate {
  /** Canonical organization name. New writes must use this field. */
  businessName?: string;
  /** Legacy input only. It is never persisted back to settings_json.displayName. */
  displayName?: string;
  address?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  themePreference?: 'institutional' | 'balanced' | 'cool';
  locale?: string;
}

function cleanOptionalText(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isValidOptionalEmail(value: string | null): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
): Promise<{ success: boolean; organizationName?: string; updatedSettings?: Record<string, unknown>; error?: string }> {
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

  const beforeData = {
    name: access.organizationName,
    settings: { ...access.settingsJson },
    locale: access.locale,
  };
  const {
    businessName,
    displayName: legacyDisplayName,
    locale,
    address,
    phone,
    email,
    workingHours,
    themePreference,
  } = newSettings;
  const requestedName = typeof businessName === 'string' ? businessName : legacyDisplayName;
  const organizationName = typeof requestedName === 'string' ? requestedName.trim() : access.organizationName;
  if (!organizationName) {
    return { success: false, error: 'Il nome dell’azienda è obbligatorio.' };
  }

  const normalizedEmail = cleanOptionalText(email);
  if (!isValidOptionalEmail(normalizedEmail)) {
    return { success: false, error: 'Inserisci un indirizzo email valido.' };
  }

  // displayName is intentionally excluded: it remains read-only legacy compatibility.
  // Only the fields still owned by settings_json are merged here.
  const settingsJsonUpdates: Record<string, unknown> = {};
  const normalizedAddress = cleanOptionalText(address);
  const normalizedPhone = cleanOptionalText(phone);
  const normalizedWorkingHours = cleanOptionalText(workingHours);
  if (address !== undefined) settingsJsonUpdates.address = normalizedAddress;
  if (phone !== undefined) settingsJsonUpdates.phone = normalizedPhone;
  if (email !== undefined) settingsJsonUpdates.email = normalizedEmail;
  if (workingHours !== undefined) settingsJsonUpdates.working_hours = normalizedWorkingHours;
  if (themePreference !== undefined) settingsJsonUpdates.themePreference = themePreference;

  const afterSettingsJson = { ...access.settingsJson, ...settingsJsonUpdates };
  const afterData = {
    name: organizationName,
    settings: afterSettingsJson,
    locale: locale || access.locale,
  };

  const updatePayload: Record<string, unknown> = {
    name: organizationName,
    settings_json: afterSettingsJson,
  };
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
  return { success: true, organizationName, updatedSettings: afterSettingsJson };
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
