import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { 
  Service, Professional, AvailableTimeSlot, Appointment, 
  CreateServiceInput, UpdateServiceInput, CreateProfessionalInput, UpdateProfessionalInput,
  CreateTimeSlotInput, CreateAppointmentInput, AppointmentStatus, AppointmentListOptions
} from './calendar.types';
import { normalizePhoneNumber } from '@/modules/crm/crm.service';

function canManage(role: string): boolean {
  return role === 'organization_owner' || role === 'organization_operator';
}

function mapService(row: Record<string, unknown>): Service {
  const rawPrice = row.price_cents ?? row.price;
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    description: row.description as string | null || null,
    durationMinutes: Number(row.duration_minutes),
    bufferAfterMinutes: Number(row.buffer_after_minutes || 0),
    price: rawPrice === null || rawPrice === undefined ? null : Number(rawPrice),
    status: row.status as Service['status'],
    createdAt: row.created_at as string,
  };
}

function mapProfessional(row: Record<string, unknown>): Professional {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    email: row.email as string | null || null,
    phoneNormalized: (row.phone ?? row.phone_normalized) as string | null || null,
    status: row.status as Professional['status'],
    title: row.title as string | null || null,
    createdAt: row.created_at as string,
  };
}

function cleanRequiredName(value: string | undefined, label: string): { value?: string; error?: string } {
  const cleaned = value?.trim();
  return cleaned ? { value: cleaned } : { error: `${label} è obbligatorio.` };
}

function isValidEmail(value: string | null | undefined): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Lists organization services under RLS.
 */
export async function listServices(client: SupabaseClient, userId: string, organizationSlug: string, options?: { includeInactive?: boolean }): Promise<Service[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  let query = client
    .from('services')
    .select('*')
    .eq('organization_id', access.organizationId)
    .order('name', { ascending: true });

  if (!options?.includeInactive || !canManage(access.role)) query = query.eq('status', 'active');

  const { data, error } = await query;

  if (error) throw new Error(`Errore durante il recupero dei servizi: ${error.message}`);
  return (data || []).map(row => mapService(row as Record<string, unknown>));
}

/**
 * Creates a new service and logs audit event.
 */
export async function createService(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateServiceInput, correlationId: string
): Promise<{ success: boolean; data?: Service; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !canManage(access.role)) {
    return { success: false, error: 'Permessi insufficienti per creare un servizio.' };
  }

  const name = cleanRequiredName(input.name, 'Il nome del servizio');
  if (name.error) return { success: false, error: name.error };
  const durationMinutes = Number(input.durationMinutes);
  const priceCents = input.price ?? 0;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return { success: false, error: 'La durata deve essere un numero intero positivo.' };
  if (!Number.isInteger(priceCents) || priceCents < 0) return { success: false, error: 'Il prezzo deve essere un importo non negativo in centesimi.' };

  const insertPayload = {
    organization_id: access.organizationId,
    name: name.value,
    description: input.description ? input.description.trim() : null,
    duration_minutes: durationMinutes,
    price_cents: priceCents,
    status: 'active',
  };

  const { data: created, error } = await client.from('services').insert([insertPayload]).select('*').single();
  if (error || !created) return { success: false, error: `Impossibile creare il servizio: ${error?.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_SERVICE', entityType: 'service', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient);

  return {
    success: true,
    data: mapService(created as Record<string, unknown>),
  };
}

/** Updates the existing service owned by the resolved organization. */
export async function updateService(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  serviceId: string, input: UpdateServiceInput, correlationId: string,
): Promise<{ success: boolean; data?: Service; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !canManage(access.role)) return { success: false, error: 'Permessi insufficienti per aggiornare il servizio.' };

  const { data: existing, error: fetchError } = await client.from('services').select('*')
    .eq('id', serviceId).eq('organization_id', access.organizationId).single();
  if (fetchError || !existing) return { success: false, error: 'Servizio non trovato in questa organizzazione.' };

  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = cleanRequiredName(input.name, 'Il nome del servizio');
    if (name.error) return { success: false, error: name.error };
    payload.name = name.value;
  }
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.durationMinutes !== undefined) {
    const duration = Number(input.durationMinutes);
    if (!Number.isInteger(duration) || duration <= 0) return { success: false, error: 'La durata deve essere un numero intero positivo.' };
    payload.duration_minutes = duration;
  }
  if (input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isInteger(price) || price < 0) return { success: false, error: 'Il prezzo deve essere un importo non negativo in centesimi.' };
    payload.price_cents = price;
  }
  if (input.status !== undefined) payload.status = input.status;
  if (!Object.keys(payload).length) return { success: false, error: 'Nessuna modifica del servizio ricevuta.' };

  const { data: updated, error } = await client.from('services').update(payload)
    .eq('id', serviceId).eq('organization_id', access.organizationId).select('*').single();
  if (error || !updated) return { success: false, error: `Impossibile aggiornare il servizio: ${error?.message || 'errore sconosciuto'}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user', action: 'UPDATE_SERVICE',
    entityType: 'service', entityId: serviceId, beforeData: existing, afterData: payload, correlationId,
  }, adminClient);
  return { success: true, data: mapService(updated as Record<string, unknown>) };
}

/**
 * Lists professionals under RLS.
 */
export async function listProfessionals(client: SupabaseClient, userId: string, organizationSlug: string, options?: { includeInactive?: boolean }): Promise<Professional[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  let query = client
    .from('professionals')
    .select('*')
    .eq('organization_id', access.organizationId)
    .order('name', { ascending: true });

  if (!options?.includeInactive || !canManage(access.role)) query = query.eq('status', 'active');

  const { data, error } = await query;

  if (error) throw new Error(`Errore durante il recupero dei professionisti: ${error.message}`);
  return (data || []).map(row => mapProfessional(row as Record<string, unknown>));
}

/**
 * Creates a new professional and logs audit event.
 */
export async function createProfessional(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateProfessionalInput, correlationId: string
): Promise<{ success: boolean; data?: Professional; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !canManage(access.role)) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  let phone: string | null = null;
  if (input.phone) {
    const res = normalizePhoneNumber(input.phone);
    if (!res.valid || !res.normalized) {
      return { success: false, error: res.reason || 'Numero di telefono del professionista non valido.' };
    }
    phone = res.normalized;
  }

  const name = cleanRequiredName(input.name, 'Il nome del professionista');
  if (name.error) return { success: false, error: name.error };
  const email = input.email?.trim() || null;
  if (!isValidEmail(email)) return { success: false, error: 'Inserisci un indirizzo email valido.' };
  const insertPayload = {
    organization_id: access.organizationId,
    name: name.value,
    title: input.title?.trim() || '',
    email,
    phone,
    status: 'active',
  };

  const { data: created, error } = await client.from('professionals').insert([insertPayload]).select('*').single();
  if (error || !created) return { success: false, error: `Impossibile creare il professionista: ${error?.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_PROFESSIONAL', entityType: 'professional', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient);

  return {
    success: true,
    data: mapProfessional(created as Record<string, unknown>),
  };
}

/** Updates an existing professional without crossing the organization boundary. */
export async function updateProfessional(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  professionalId: string, input: UpdateProfessionalInput, correlationId: string,
): Promise<{ success: boolean; data?: Professional; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !canManage(access.role)) return { success: false, error: 'Permessi insufficienti per aggiornare il professionista.' };

  const { data: existing, error: fetchError } = await client.from('professionals').select('*')
    .eq('id', professionalId).eq('organization_id', access.organizationId).single();
  if (fetchError || !existing) return { success: false, error: 'Professionista non trovato in questa organizzazione.' };

  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = cleanRequiredName(input.name, 'Il nome del professionista');
    if (name.error) return { success: false, error: name.error };
    payload.name = name.value;
  }
  if (input.title !== undefined) payload.title = input.title?.trim() || '';
  if (input.email !== undefined) {
    const email = input.email?.trim() || null;
    if (!isValidEmail(email)) return { success: false, error: 'Inserisci un indirizzo email valido.' };
    payload.email = email;
  }
  if (input.phone !== undefined) {
    if (!input.phone) payload.phone = null;
    else {
      const normalized = normalizePhoneNumber(input.phone);
      if (!normalized.valid || !normalized.normalized) return { success: false, error: normalized.reason || 'Numero di telefono non valido.' };
      payload.phone = normalized.normalized;
    }
  }
  if (input.status !== undefined) payload.status = input.status;
  if (!Object.keys(payload).length) return { success: false, error: 'Nessuna modifica del professionista ricevuta.' };

  const { data: updated, error } = await client.from('professionals').update(payload)
    .eq('id', professionalId).eq('organization_id', access.organizationId).select('*').single();
  if (error || !updated) return { success: false, error: `Impossibile aggiornare il professionista: ${error?.message || 'errore sconosciuto'}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user', action: 'UPDATE_PROFESSIONAL',
    entityType: 'professional', entityId: professionalId, beforeData: existing, afterData: payload, correlationId,
  }, adminClient);
  return { success: true, data: mapProfessional(updated as Record<string, unknown>) };
}

/**
 * Lists available time slots under RLS.
 */
export async function listTimeSlots(client: SupabaseClient, userId: string, organizationSlug: string, professionalId?: string): Promise<AvailableTimeSlot[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  let query = client
    .from('availability_rules')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('is_active', true)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (professionalId) query = query.eq('professional_id', professionalId);

  const { data, error } = await query;
  if (error) throw new Error(`Errore durante il recupero delle fasce orarie: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    professionalId: row.professional_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    isActive: row.is_active,
  }));
}

/**
 * Creates an available time slot and logs audit event.
 */
export async function createTimeSlot(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateTimeSlotInput, correlationId: string
): Promise<{ success: boolean; data?: AvailableTimeSlot; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  const insertPayload = {
    organization_id: access.organizationId,
    professional_id: input.professionalId,
    day_of_week: Number(input.dayOfWeek),
    start_time: input.startTime,
    end_time: input.endTime,
    is_active: true,
  };

  const { data: created, error } = await client.from('availability_rules').insert([insertPayload]).select('*').single();
  if (error || !created) return { success: false, error: `Impossibile salvare la fascia oraria: ${error?.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_TIME_SLOT', entityType: 'availability_rule', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient);

  return {
    success: true,
    data: {
      id: created.id, organizationId: created.organization_id, professionalId: created.professional_id,
      dayOfWeek: created.day_of_week, startTime: created.start_time, endTime: created.end_time, isActive: created.is_active,
    }
  };
}

/**
 * Lists appointments with joined display metadata.
 */
export async function listAppointments(client: SupabaseClient, userId: string, organizationSlug: string, options?: AppointmentListOptions): Promise<Appointment[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  let query = client
    .from('appointments')
    .select(`
      *,
      customers(first_name, last_name),
      services(name),
      professionals(name)
    `)
    .eq('organization_id', access.organizationId);

  if (options?.startAt) query = query.gte('start_at', options.startAt);
  if (options?.endAt) query = query.lt('start_at', options.endAt);
  const { data, error } = await query.order('start_at', { ascending: true });

  if (error) throw new Error(`Errore durante il recupero degli appuntamenti: ${error.message}`);

  return (data || []).map(row => {
    const cust = row.customers as unknown as { first_name: string; last_name: string } | null;
    const srv = row.services as unknown as { name: string } | null;
    const prof = row.professionals as unknown as { name: string } | null;

    return {
      id: row.id,
      organizationId: row.organization_id,
      customerId: row.customer_id,
      serviceId: row.service_id,
      professionalId: row.professional_id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status as AppointmentStatus,
      notes: row.notes || null,
      cancellationReason: row.cancellation_reason || null,
      heldUntil: row.held_until || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerName: cust ? `${cust.first_name} ${cust.last_name}` : 'Cliente sconosciuto',
      serviceName: srv ? srv.name : 'Servizio Rimosso',
      professionalName: prof ? prof.name : 'Professionista Non Assegnato',
    };
  });
}

/**
 * Creates an appointment with automatic duration calculation and strict database anti-overlap enforcement.
 */
export async function createAppointment(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateAppointmentInput, correlationId: string, logger?: Logger
): Promise<{ success: boolean; code: string; appointmentId?: string; data?: Appointment; error?: string; isGistOverlapError?: boolean }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, code: 'PERMISSION_DENIED', error: 'Permessi insufficienti per agendare appuntamenti.' };
  }

  // All referenced entities must belong to the resolved organization. Foreign
  // keys alone do not prevent cross-tenant references when UUIDs are known.
  const [customerResult, professionalResult, serviceResult] = await Promise.all([
    client
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .eq('organization_id', access.organizationId)
      .eq('status', 'active')
      .single(),
    client
      .from('professionals')
      .select('id')
      .eq('id', input.professionalId)
      .eq('organization_id', access.organizationId)
      .eq('status', 'active')
      .single(),
    client
      .from('services')
      .select('duration_minutes')
      .eq('id', input.serviceId)
      .eq('organization_id', access.organizationId)
      .eq('status', 'active')
      .single(),
  ]);

  if (customerResult.error || !customerResult.data) {
    return { success: false, code: 'CUSTOMER_NOT_FOUND', error: 'Cliente non valido o non appartenente al tenant.' };
  }
  if (professionalResult.error || !professionalResult.data) {
    return { success: false, code: 'PROFESSIONAL_NOT_FOUND', error: 'Professionista non valido o non appartenente al tenant.' };
  }

  if (serviceResult.error || !serviceResult.data) {
    return { success: false, code: 'SERVICE_NOT_FOUND', error: 'Servizio specificato non valido o inesistente nel tenant.' };
  }
  const serviceRow = serviceResult.data;

  const startDate = new Date(input.startAt);
  if (isNaN(startDate.getTime())) {
    return { success: false, code: 'INVALID_START_TIME', error: 'Data e ora di inizio non valide.' };
  }

  const durationMs = serviceRow.duration_minutes * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const insertPayload = {
    organization_id: access.organizationId,
    customer_id: input.customerId,
    service_id: input.serviceId,
    professional_id: input.professionalId,
    start_at: startDate.toISOString(),
    end_at: endDate.toISOString(),
    status: 'confirmed',
    notes: input.notes ? input.notes.trim() : null,
  };

  const { data: created, error } = await client
    .from('appointments')
    .insert([insertPayload])
    .select('*')
    .single();

  if (error || !created) {
    log.error('Appointment creation failed', { error });
    if (error?.code === '23P01') {
      return { 
        success: false, 
        code: 'SLOT_OCCUPIED',
        isGistOverlapError: true,
        error: 'Conflitto di orario (Double-Booking bloccato meccanicamente). Il professionista selezionato è già impegnato in un appuntamento confermato nel periodo indicato.' 
      };
    }
    return { success: false, code: 'APPOINTMENT_CREATE_FAILED', error: `Impossibile agendare l'appuntamento: ${error?.message || 'Errore DB'}` };
  }

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_APPOINTMENT', entityType: 'appointment', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient, log);

  log.info('Appointment scheduled cleanly and checked against GIST anti-overlap constraint', { id: created.id });
  return {
    success: true,
    code: 'APPOINTMENT_CREATED',
    appointmentId: created.id,
    data: {
      id: created.id, organizationId: created.organization_id, customerId: created.customer_id,
      serviceId: created.service_id, professionalId: created.professional_id,
      startAt: created.start_at, endAt: created.end_at, status: created.status,
      notes: created.notes, cancellationReason: null, heldUntil: null,
      createdAt: created.created_at, updatedAt: created.updated_at,
    }
  };
}

/**
 * Updates appointment status (e.g. cancelling or completing) and records Audit Log.
 */
export async function updateAppointmentStatus(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  appointmentId: string, newStatus: AppointmentStatus, cancellationReason: string | null,
  correlationId: string, logger?: Logger
): Promise<{ success: boolean; code: string; appointmentId?: string; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, code: 'PERMISSION_DENIED', error: 'Permessi insufficienti.' };
  }

  const { data: existing, error: fetchErr } = await client
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) return { success: false, code: 'APPOINTMENT_NOT_FOUND', error: 'Appuntamento non trovato nel tenant.' };

  const allowedTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    held: ['confirmed', 'cancelled', 'expired'],
    confirmed: ['cancelled', 'completed', 'no_show'],
    cancelled: [],
    completed: [],
    no_show: [],
    expired: [],
  };
  const existingStatus = existing.status as AppointmentStatus;
  if (!allowedTransitions[existingStatus]?.includes(newStatus)) {
    return { success: false, code: 'INVALID_APPOINTMENT_STATUS_TRANSITION', error: 'La transizione di stato richiesta non è consentita.' };
  }

  const updatePayload: Record<string, unknown> = { status: newStatus };
  const auditAfterData = newStatus === 'cancelled' && cancellationReason
    ? { ...updatePayload, cancellation_reason: cancellationReason }
    : updatePayload;

  const { error } = await client
    .from('appointments')
    .update(updatePayload)
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId);

  if (error) return { success: false, code: 'APPOINTMENT_STATUS_UPDATE_FAILED', error: `Impossibile aggiornare lo stato: ${error.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: `UPDATE_APPOINTMENT_STATUS_${newStatus.toUpperCase()}`, entityType: 'appointment', entityId: appointmentId,
    beforeData: { status: existing.status }, afterData: auditAfterData, correlationId,
  }, adminClient, log);

  return { success: true, code: `APPOINTMENT_${newStatus.toUpperCase()}`, appointmentId };
}

export async function rescheduleAppointment(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  appointmentId: string, newStartAt: string, correlationId: string, logger?: Logger
): Promise<{ success: boolean; code: string; appointmentId?: string; data?: Appointment; error?: string; isGistOverlapError?: boolean }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, code: 'PERMISSION_DENIED', error: 'Permessi insufficienti per riprogrammare appuntamenti.' };
  }

  // 1. Fetch existing appointment to get service_id, professional_id, status, etc.
  const { data: existing, error: fetchErr } = await client
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, code: 'APPOINTMENT_NOT_FOUND', error: 'Appuntamento non trovato.' };
  }

  if (!['held', 'confirmed'].includes(existing.status)) {
    return { success: false, code: 'INVALID_APPOINTMENT_STATUS_TRANSITION', error: 'Solo un appuntamento attivo può essere riprogrammato.' };
  }

  // 2. Fetch service to get duration_minutes
  const { data: serviceRow, error: serviceError } = await client
    .from('services')
    .select('duration_minutes')
    .eq('id', existing.service_id)
    .eq('organization_id', access.organizationId)
    .single();

  if (serviceError || !serviceRow) {
    return { success: false, code: 'SERVICE_NOT_FOUND', error: 'Servizio dell\'appuntamento non valido.' };
  }

  const startDate = new Date(newStartAt);
  if (isNaN(startDate.getTime())) {
    return { success: false, code: 'INVALID_START_TIME', error: 'Nuova data e ora di inizio non valida.' };
  }

  const durationMs = serviceRow.duration_minutes * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const beforeData = {
    start_at: existing.start_at,
    end_at: existing.end_at,
    status: existing.status
  };

  const updatePayload = {
    start_at: startDate.toISOString(),
    end_at: endDate.toISOString(),
    status: 'confirmed'
  };

  const { data: updated, error: updateError } = await client
    .from('appointments')
    .update(updatePayload)
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId)
    .select('*')
    .single();

  if (updateError || !updated) {
    log.error('Appointment reschedule failed', { error: updateError });
    if (updateError?.code === '23P01') {
      return { 
        success: false, 
        code: 'SLOT_OCCUPIED',
        isGistOverlapError: true,
        error: 'Conflitto di orario (Double-Booking bloccato meccanicamente). Il professionista selezionato è già impegnato in un appuntamento confermato nel periodo indicato.' 
      };
    }
    return { success: false, code: 'APPOINTMENT_RESCHEDULE_FAILED', error: `Impossibile spostare l'appuntamento: ${updateError?.message || 'Errore DB'}` };
  }

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'RESCHEDULE_APPOINTMENT', entityType: 'appointment', entityId: appointmentId,
    beforeData, afterData: updatePayload, correlationId,
  }, adminClient, log);

  return {
    success: true,
    code: 'APPOINTMENT_RESCHEDULED',
    appointmentId: updated.id,
    data: {
      id: updated.id, organizationId: updated.organization_id, customerId: updated.customer_id,
      serviceId: updated.service_id, professionalId: updated.professional_id,
      startAt: updated.start_at, endAt: updated.end_at, status: updated.status,
      notes: updated.notes, cancellationReason: updated.cancellation_reason || null, heldUntil: null,
      createdAt: updated.created_at, updatedAt: updated.updated_at,
    }
  };
}
