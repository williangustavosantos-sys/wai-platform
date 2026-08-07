import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { BusinessRulesConfig, BusinessException, UpdateBusinessRulesInput, CreateBusinessExceptionInput } from './rules.types';

const DEFAULT_BUSINESS_RULES = {
  cancellationWindowHours: 24,
  noShowPolicyNote: 'In caso di mancata presentazione senza preavviso di 24h, lo studio si riserva la riprogrammazione successiva.',
  welcomeMessage: 'Buongiorno e benvenuto. Sono l\'assistente digitale di studio, come posso aiutarti oggi?',
  confirmationMessageTemplate: 'Il tuo appuntamento è confermato per il giorno {data_ora} con {professionista}. A presto!',
  cancellationMessageTemplate: 'Ti confermiamo che il tuo appuntamento del {data_ora} è stato cancellato come richiesto.',
  outOfHoursMessage: 'Grazie per averci contattato! Attualmente siamo chiusi al pubblico, prenderemo in carico il messaggio alla riapertura.',
  autoConfirmAppointments: true,
  maxAdvanceDaysBooking: 60,
};

function deriveIsFullDay(startAt: string, endAt: string): boolean {
  // Nota de compatibilidade: O schema 'closures' não possui coluna booleana 'is_full_day'.
  // Verificamos se o intervalo começa em 00:00:00 e termina em 23:59:59 para inferir que cobre o dia completo.
  if (!startAt || !endAt) return false;
  return startAt.includes('T00:00:00') && endAt.includes('T23:59:59');
}

function mapDbToConfig(row: Record<string, unknown>): BusinessRulesConfig {
  const cancelPolicy = (row.cancellation_policy as Record<string, unknown>) || {};
  const stdMessages = (row.standard_messages as Record<string, unknown>) || {};
  const respRules = (row.response_rules as Record<string, unknown>) || {};

  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    cancellationWindowHours: Number(cancelPolicy.min_hours_notice ?? DEFAULT_BUSINESS_RULES.cancellationWindowHours),
    noShowPolicyNote: (cancelPolicy.no_show_note as string) || DEFAULT_BUSINESS_RULES.noShowPolicyNote,
    welcomeMessage: (stdMessages.welcome as string) || DEFAULT_BUSINESS_RULES.welcomeMessage,
    confirmationMessageTemplate: (stdMessages.confirmation as string) || DEFAULT_BUSINESS_RULES.confirmationMessageTemplate,
    cancellationMessageTemplate: (stdMessages.cancellation as string) || DEFAULT_BUSINESS_RULES.cancellationMessageTemplate,
    outOfHoursMessage: (stdMessages.out_of_hours as string) || DEFAULT_BUSINESS_RULES.outOfHoursMessage,
    autoConfirmAppointments: Boolean(respRules.auto_confirm_appointments !== undefined ? respRules.auto_confirm_appointments : DEFAULT_BUSINESS_RULES.autoConfirmAppointments),
    maxAdvanceDaysBooking: Number(respRules.max_advance_booking_days ?? DEFAULT_BUSINESS_RULES.maxAdvanceDaysBooking),
    minAdvanceBookingHours: Number(respRules.min_advance_booking_hours ?? 0),
    customRulesJson: (respRules.custom as Record<string, unknown>) || {},
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
    .from('business_rules')
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
      cancellation_policy: {
        min_hours_notice: DEFAULT_BUSINESS_RULES.cancellationWindowHours,
        fee_percent: 0,
        refund_policy: 'standard',
        no_show_note: DEFAULT_BUSINESS_RULES.noShowPolicyNote,
      },
      standard_messages: {
        welcome: DEFAULT_BUSINESS_RULES.welcomeMessage,
        confirmation: DEFAULT_BUSINESS_RULES.confirmationMessageTemplate,
        cancellation: DEFAULT_BUSINESS_RULES.cancellationMessageTemplate,
        out_of_hours: DEFAULT_BUSINESS_RULES.outOfHoursMessage,
      },
      response_rules: {
        auto_confirm_appointments: DEFAULT_BUSINESS_RULES.autoConfirmAppointments,
        max_advance_booking_days: DEFAULT_BUSINESS_RULES.maxAdvanceDaysBooking,
        min_advance_booking_hours: 2,
        custom: {},
      },
    };

    const { data: created, error: createError } = await client
      .from('business_rules')
      .insert([defaultInsert])
      .select('*')
      .single();

    if (createError || !created) {
      throw new Error(`Impossibile inizializzare le regole aziendali: ${createError?.message || 'Errore DB'}`);
    }

    const newConfig = mapDbToConfig(created as Record<string, unknown>);
    await recordAuditLog({
      organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
      action: 'CREATE_BUSINESS_RULES_CONFIG', entityType: 'business_rules', entityId: newConfig.id,
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

  const { data: dbCurrent, error: fetchErr } = await client
    .from('business_rules')
    .select('*')
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !dbCurrent) return { success: false, error: 'Configurazione regole non trovata.' };

  const current = mapDbToConfig(dbCurrent as Record<string, unknown>);
  const cancelPolicy = { ...(dbCurrent.cancellation_policy as Record<string, unknown> || {}) };
  const stdMessages = { ...(dbCurrent.standard_messages as Record<string, unknown> || {}) };
  const respRules = { ...(dbCurrent.response_rules as Record<string, unknown> || {}) };

  if (input.cancellationWindowHours !== undefined) cancelPolicy.min_hours_notice = Number(input.cancellationWindowHours);
  if (input.noShowPolicyNote !== undefined) cancelPolicy.no_show_note = input.noShowPolicyNote ? input.noShowPolicyNote.trim() : null;
  if (input.welcomeMessage !== undefined) stdMessages.welcome = input.welcomeMessage.trim();
  if (input.confirmationMessageTemplate !== undefined) stdMessages.confirmation = input.confirmationMessageTemplate.trim();
  if (input.cancellationMessageTemplate !== undefined) stdMessages.cancellation = input.cancellationMessageTemplate.trim();
  if (input.outOfHoursMessage !== undefined) stdMessages.out_of_hours = input.outOfHoursMessage.trim();
  if (input.autoConfirmAppointments !== undefined) respRules.auto_confirm_appointments = input.autoConfirmAppointments;
  if (input.maxAdvanceDaysBooking !== undefined) respRules.max_advance_booking_days = Number(input.maxAdvanceDaysBooking);

  const updatePayload = {
    cancellation_policy: cancelPolicy,
    standard_messages: stdMessages,
    response_rules: respRules,
  };

  const { data: updated, error } = await client
    .from('business_rules')
    .update(updatePayload)
    .eq('id', current.id)
    .eq('organization_id', access.organizationId)
    .select('*')
    .single();

  if (error || !updated) return { success: false, error: `Errore durante il salvataggio: ${error?.message}` };

  const newConfig = mapDbToConfig(updated as Record<string, unknown>);
  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'UPDATE_BUSINESS_RULES_CONFIG', entityType: 'business_rules', entityId: current.id,
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
    .from('closures')
    .select('*')
    .eq('organization_id', access.organizationId)
    .order('start_at', { ascending: true });

  if (error) throw new Error(`Errore durante il recupero dei periodi di chiusura: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    startDate: row.start_at,
    endDate: row.end_at,
    reason: row.reason,
    isFullDay: deriveIsFullDay(row.start_at as string, row.end_at as string),
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

  const isFullDay = input.isFullDay !== undefined ? input.isFullDay : true;
  const startAt = (isFullDay || !input.startDate.includes('T'))
    ? (input.startDate.includes('T') ? input.startDate.split('T')[0] + 'T00:00:00.000Z' : `${input.startDate}T00:00:00.000Z`)
    : input.startDate;
  const endAt = (isFullDay || !input.endDate.includes('T'))
    ? (input.endDate.includes('T') ? input.endDate.split('T')[0] + 'T23:59:59.999Z' : `${input.endDate}T23:59:59.999Z`)
    : input.endDate;

  const insertPayload = {
    organization_id: access.organizationId,
    start_at: startAt,
    end_at: endAt,
    reason: input.reason.trim(),
    closure_type: 'holiday',
  };

  const { data: created, error } = await client.from('closures').insert([insertPayload]).select('*').single();
  if (error || !created) return { success: false, error: `Impossibile aggiungere periodo di chiusura: ${error?.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_BUSINESS_EXCEPTION', entityType: 'closure', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient);

  return {
    success: true,
    data: {
      id: created.id, organizationId: created.organization_id, startDate: created.start_at,
      endDate: created.end_at, reason: created.reason, isFullDay: deriveIsFullDay(created.start_at, created.end_at), createdAt: created.created_at,
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
    .from('closures')
    .select('*')
    .eq('id', exceptionId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Periodo non trovato o già rimosso.' };

  const { error } = await client
    .from('closures')
    .delete()
    .eq('id', exceptionId)
    .eq('organization_id', access.organizationId);

  if (error) return { success: false, error: `Errore durante la rimozione: ${error.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'DELETE_BUSINESS_EXCEPTION', entityType: 'closure', entityId: exceptionId,
    beforeData: { ...existing }, correlationId,
  }, adminClient);

  return { success: true };
}
