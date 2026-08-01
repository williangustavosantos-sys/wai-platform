import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { BusinessRulesConfig, BusinessException, UpdateBusinessRulesInput, CreateBusinessExceptionInput } from './rules.types';

function mapDbToConfig(row: Record<string, unknown>): BusinessRulesConfig {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    cancellationWindowHours: Number(row.cancellation_window_hours),
    noShowPolicyNote: (row.no_show_policy_note as string) || null,
    welcomeMessage: (row.welcome_message as string) || '',
    confirmationMessageTemplate: (row.confirmation_message_template as string) || '',
    cancellationMessageTemplate: (row.cancellation_message_template as string) || '',
    outOfHoursMessage: (row.out_of_hours_message as string) || '',
    autoConfirmAppointments: Boolean(row.auto_confirm_appointments),
    maxAdvanceDaysBooking: Number(row.max_advance_days_booking || 30),
    customRulesJson: (row.custom_rules_json as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Retrieves the organization's business rules configuration. Initializes defaults if missing.
 */
export async function getBusinessRulesConfig(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  correlationId: string, logger?: Logger
): Promise<BusinessRulesConfig | null> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access) return null;

  const { data, error } = await client
    .from('business_rules_configs')
    .select('*')
    .eq('organization_id', access.organizationId)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Errore durante il recupero delle regole aziendali: ${error.message}`);
  }

  if (data) return mapDbToConfig(data as Record<string, unknown>);

  if (access.role === 'organization_owner' || access.role === 'organization_operator') {
    const defaultInsert = {
      organization_id: access.organizationId,
      cancellation_window_hours: 24,
      no_show_policy_note: 'In caso di mancata presentazione senza preavviso di 24h, lo studio si riserva la riprogrammazione successiva.',
      welcome_message: 'Buongiorno e benvenuto. Sono l\'assistente digitale di studio, come posso aiutarti oggi?',
      confirmation_message_template: 'Il tuo appuntamento è confermato per il giorno {data_ora} con {professionista}. A presto!',
      cancellation_message_template: 'Ti confermiamo che il tuo appuntamento del {data_ora} è stato cancellato come richiesto.',
      out_of_hours_message: 'Grazie per averci contattato! Attualmente siamo chiusi al pubblico, prenderemo in carico il messaggio alla riapertura.',
      auto_confirm_appointments: true,
      max_advance_days_booking: 60,
      custom_rules_json: {}
    };

    const { data: created, error: createError } = await client
      .from('business_rules_configs')
      .insert([defaultInsert])
      .select('*')
      .single();

    if (createError || !created) {
      throw new Error(`Impossibile inizializzare le regole aziendali: ${createError?.message || 'Errore DB'}`);
    }

    const newConfig = mapDbToConfig(created as Record<string, unknown>);
    await recordAuditLog({
      organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
      action: 'CREATE_BUSINESS_RULES_CONFIG', entityType: 'business_rules_config', entityId: newConfig.id,
      afterData: { ...defaultInsert }, correlationId,
    }, adminClient, log);

    return newConfig;
  }

  return null;
}

/**
 * Updates business rules and logs audit event.
 */
export async function updateBusinessRulesConfig(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: UpdateBusinessRulesInput, correlationId: string, logger?: Logger
): Promise<{ success: boolean; data?: BusinessRulesConfig; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  const current = await getBusinessRulesConfig(client, adminClient, userId, organizationSlug, correlationId, log);
  if (!current) return { success: false, error: 'Configurazione regole non trovata.' };

  const updatePayload: Record<string, unknown> = {};
  if (input.cancellationWindowHours !== undefined) updatePayload.cancellation_window_hours = Number(input.cancellationWindowHours);
  if (input.noShowPolicyNote !== undefined) updatePayload.no_show_policy_note = input.noShowPolicyNote ? input.noShowPolicyNote.trim() : null;
  if (input.welcomeMessage !== undefined) updatePayload.welcome_message = input.welcomeMessage.trim();
  if (input.confirmationMessageTemplate !== undefined) updatePayload.confirmation_message_template = input.confirmationMessageTemplate.trim();
  if (input.cancellationMessageTemplate !== undefined) updatePayload.cancellation_message_template = input.cancellationMessageTemplate.trim();
  if (input.outOfHoursMessage !== undefined) updatePayload.out_of_hours_message = input.outOfHoursMessage.trim();
  if (input.autoConfirmAppointments !== undefined) updatePayload.auto_confirm_appointments = input.autoConfirmAppointments;
  if (input.maxAdvanceDaysBooking !== undefined) updatePayload.max_advance_days_booking = Number(input.maxAdvanceDaysBooking);

  const { data: updated, error } = await client
    .from('business_rules_configs')
    .update(updatePayload)
    .eq('id', current.id)
    .eq('organization_id', access.organizationId)
    .select('*')
    .single();

  if (error || !updated) return { success: false, error: `Errore durante il salvataggio: ${error?.message}` };

  const newConfig = mapDbToConfig(updated as Record<string, unknown>);
  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'UPDATE_BUSINESS_RULES_CONFIG', entityType: 'business_rules_config', entityId: current.id,
    beforeData: { ...current }, afterData: { ...newConfig }, correlationId,
  }, adminClient, log);

  return { success: true, data: newConfig };
}

/**
 * Lists holiday periods / closures under RLS.
 */
export async function listBusinessExceptions(client: SupabaseClient, userId: string, organizationSlug: string): Promise<BusinessException[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  const { data, error } = await client
    .from('business_exceptions_and_closures')
    .select('*')
    .eq('organization_id', access.organizationId)
    .order('start_date', { ascending: true });

  if (error) throw new Error(`Errore durante il recupero dei periodi di chiusura: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    isFullDay: Boolean(row.is_full_day),
    createdAt: row.created_at,
  }));
}

/**
 * Adds a new closure or exception period and logs audit event.
 */
export async function createBusinessException(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateBusinessExceptionInput, correlationId: string
): Promise<{ success: boolean; data?: BusinessException; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  const insertPayload = {
    organization_id: access.organizationId,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason.trim(),
    is_full_day: input.isFullDay !== undefined ? input.isFullDay : true,
  };

  const { data: created, error } = await client.from('business_exceptions_and_closures').insert([insertPayload]).select('*').single();
  if (error || !created) return { success: false, error: `Impossibile aggiungere periodo di chiusura: ${error?.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_BUSINESS_EXCEPTION', entityType: 'business_exception', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient);

  return {
    success: true,
    data: {
      id: created.id, organizationId: created.organization_id, startDate: created.start_date,
      endDate: created.end_date, reason: created.reason, isFullDay: created.is_full_day, createdAt: created.created_at,
    }
  };
}

/**
 * Removes an exception period and logs audit event.
 */
export async function deleteBusinessException(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  exceptionId: string, correlationId: string
): Promise<{ success: boolean; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  const { data: existing, error: fetchErr } = await client
    .from('business_exceptions_and_closures')
    .select('*')
    .eq('id', exceptionId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Periodo non trovato o già rimosso.' };

  const { error } = await client
    .from('business_exceptions_and_closures')
    .delete()
    .eq('id', exceptionId)
    .eq('organization_id', access.organizationId);

  if (error) return { success: false, error: `Errore durante la rimozione: ${error.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'DELETE_BUSINESS_EXCEPTION', entityType: 'business_exception', entityId: exceptionId,
    beforeData: { ...existing }, correlationId,
  }, adminClient);

  return { success: true };
}
