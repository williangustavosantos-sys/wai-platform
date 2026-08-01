import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { DigitalEmployeeConfig, UpdateAssistantConfigInput, CommunicationTone, DigitalEmployeeStatus } from './assistant.types';

/**
 * Maps DB row to TypeScript domain type.
 */
function mapDbToDigitalEmployee(row: Record<string, unknown>): DigitalEmployeeConfig {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    personalitySummary: (row.personality_summary as string) || '',
    language: (row.language as string) || 'it-IT',
    communicationTone: (row.communication_tone as CommunicationTone) || 'cordial_empathic',
    avatarPlaceholderUrl: (row.avatar_placeholder_url as string) || '/avatars/default.svg',
    isDefault: Boolean(row.is_default),
    status: (row.status as DigitalEmployeeStatus) || 'active',
    settingsJson: (row.settings_json as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Retrieves the organization's digital assistant configuration under strict RLS check.
 * If none exists, creates a default operational assistant.
 */
export async function getAssistantConfig(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  correlationId: string,
  logger?: Logger
): Promise<DigitalEmployeeConfig | null> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });

  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access) {
    return null;
  }

  const { data, error } = await client
    .from('digital_employees')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('status', 'active')
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    log.error('Failed to fetch digital employee configuration', { error });
    throw new Error(`Errore durante il recupero del collaboratore digitale: ${error.message}`);
  }

  if (data) {
    return mapDbToDigitalEmployee(data as Record<string, unknown>);
  }

  // Create default assistant if none found and user has editing permissions
  if (access.role === 'organization_owner' || access.role === 'organization_operator') {
    log.info('No assistant config found. Creating initial default configuration.', { orgId: access.organizationId });
    const defaultInsert = {
      organization_id: access.organizationId,
      name: 'Chiara',
      personality_summary: 'Assistente professionale, cordiale ed efficiente per la gestione operativa e comunicativa.',
      language: 'it-IT',
      communication_tone: 'cordial_empathic',
      avatar_placeholder_url: '/avatars/chiara.svg',
      is_default: true,
      status: 'active',
      settings_json: {},
    };

    const { data: created, error: createError } = await client
      .from('digital_employees')
      .insert([defaultInsert])
      .select('*')
      .single();

    if (createError || !created) {
      log.error('Failed to create default digital employee', { error: createError });
      throw new Error(`Impossibile inizializzare l'assistente: ${createError?.message || 'Errore sconosciuto'}`);
    }

    const newConfig = mapDbToDigitalEmployee(created as Record<string, unknown>);
    await recordAuditLog(
      {
        organizationId: access.organizationId,
        actorUserId: userId,
        actorType: 'user',
        action: 'CREATE_ASSISTANT_CONFIG',
        entityType: 'digital_employee',
        entityId: newConfig.id,
        afterData: { ...defaultInsert },
        correlationId,
      },
      adminClient,
      log
    );

    return newConfig;
  }

  return null;
}

/**
 * Updates the digital employee configuration. Enforces RLS and emits an audit log.
 */
export async function updateAssistantConfig(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  input: UpdateAssistantConfigInput,
  correlationId: string,
  logger?: Logger
): Promise<{ success: boolean; data?: DigitalEmployeeConfig; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });

  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access) {
    return { success: false, error: 'Accesso negato o organizzazione non trovata.' };
  }

  if (access.role !== 'organization_owner' && access.role !== 'organization_operator') {
    return { success: false, error: 'Operazione consentita esclusivamente agli operatori o ai proprietari.' };
  }

  // Get current state for audit log
  const current = await getAssistantConfig(client, adminClient, userId, organizationSlug, correlationId, log);
  if (!current) {
    return { success: false, error: 'Configurazione del collaboratore digitale non trovata.' };
  }

  const beforeData = {
    name: current.name,
    personality_summary: current.personalitySummary,
    language: current.language,
    communication_tone: current.communicationTone,
    avatar_placeholder_url: current.avatarPlaceholderUrl,
    status: current.status,
  };

  const updatePayload: Record<string, unknown> = {};
  if (input.name !== undefined) updatePayload.name = input.name.trim();
  if (input.personalitySummary !== undefined) updatePayload.personality_summary = input.personalitySummary.trim();
  if (input.language !== undefined) updatePayload.language = input.language.trim();
  if (input.communicationTone !== undefined) updatePayload.communication_tone = input.communicationTone;
  if (input.avatarPlaceholderUrl !== undefined) updatePayload.avatar_placeholder_url = input.avatarPlaceholderUrl.trim();
  if (input.status !== undefined) updatePayload.status = input.status;

  const { data: updated, error: updateError } = await client
    .from('digital_employees')
    .update(updatePayload)
    .eq('id', current.id)
    .eq('organization_id', access.organizationId)
    .select('*')
    .single();

  if (updateError || !updated) {
    log.error('Failed to update digital employee configuration', { error: updateError });
    return { success: false, error: `Errore durante l'aggiornamento: ${updateError?.message || 'Errore sconosciuto'}` };
  }

  const updatedConfig = mapDbToDigitalEmployee(updated as Record<string, unknown>);
  const afterData = {
    name: updatedConfig.name,
    personality_summary: updatedConfig.personalitySummary,
    language: updatedConfig.language,
    communication_tone: updatedConfig.communicationTone,
    avatar_placeholder_url: updatedConfig.avatarPlaceholderUrl,
    status: updatedConfig.status,
  };

  await recordAuditLog(
    {
      organizationId: access.organizationId,
      actorUserId: userId,
      actorType: 'user',
      action: 'UPDATE_ASSISTANT_CONFIG',
      entityType: 'digital_employee',
      entityId: current.id,
      beforeData,
      afterData,
      metadata: { slug: organizationSlug },
      correlationId,
    },
    adminClient,
    log
  );

  log.info('Digital employee config updated successfully', { id: current.id });
  return { success: true, data: updatedConfig };
}
