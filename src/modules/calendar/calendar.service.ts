import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { 
  Service, Professional, AvailableTimeSlot, Appointment, 
  CreateServiceInput, CreateProfessionalInput, CreateTimeSlotInput, CreateAppointmentInput, AppointmentStatus 
} from './calendar.types';
import { normalizePhoneNumber } from '@/modules/crm/crm.service';

/**
 * Lists organization services under RLS.
 */
export async function listServices(client: SupabaseClient, userId: string, organizationSlug: string): Promise<Service[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  const { data, error } = await client
    .from('services')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) throw new Error(`Errore durante il recupero dei servizi: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || null,
    durationMinutes: row.duration_minutes,
    bufferAfterMinutes: row.buffer_after_minutes || 0,
    price: row.price !== null ? Number(row.price) : null,
    status: row.status,
    createdAt: row.created_at,
  }));
}

/**
 * Creates a new service and logs audit event.
 */
export async function createService(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateServiceInput, correlationId: string
): Promise<{ success: boolean; data?: Service; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti per creare un servizio.' };
  }

  const insertPayload = {
    organization_id: access.organizationId,
    name: input.name.trim(),
    description: input.description ? input.description.trim() : null,
    duration_minutes: Number(input.durationMinutes),
    price: input.price !== undefined ? Number(input.price) : null,
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
    data: {
      id: created.id, organizationId: created.organization_id, name: created.name,
      description: created.description, durationMinutes: created.duration_minutes,
      bufferAfterMinutes: created.buffer_after_minutes || 0,
      price: created.price, status: created.status, createdAt: created.created_at,
    }
  };
}

/**
 * Lists professionals under RLS.
 */
export async function listProfessionals(client: SupabaseClient, userId: string, organizationSlug: string): Promise<Professional[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  const { data, error } = await client
    .from('professionals')
    .select('*')
    .eq('organization_id', access.organizationId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) throw new Error(`Errore durante il recupero dei professionisti: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    email: row.email || null,
    phoneNormalized: row.phone_normalized || null,
    status: row.status,
    title: row.title || null,
    createdAt: row.created_at,
  }));
}

/**
 * Creates a new professional and logs audit event.
 */
export async function createProfessional(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  input: CreateProfessionalInput, correlationId: string
): Promise<{ success: boolean; data?: Professional; error?: string }> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
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

  const insertPayload = {
    organization_id: access.organizationId,
    name: input.name.trim(),
    email: input.email ? input.email.trim() : null,
    phone_normalized: phone,
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
    data: {
      id: created.id, organizationId: created.organization_id, name: created.name,
      email: created.email, phoneNormalized: created.phone_normalized,
      status: created.status, createdAt: created.created_at,
    }
  };
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
export async function listAppointments(client: SupabaseClient, userId: string, organizationSlug: string): Promise<Appointment[]> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access) return [];

  const { data, error } = await client
    .from('appointments')
    .select(`
      *,
      customers(first_name, last_name),
      services(name),
      professionals(name)
    `)
    .eq('organization_id', access.organizationId)
    .order('start_at', { ascending: true });

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
): Promise<{ success: boolean; data?: Appointment; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti per agendare appuntamenti.' };
  }

  // 1. Fetch service to ascertain duration in minutes
  const { data: serviceRow, error: serviceError } = await client
    .from('services')
    .select('duration_minutes')
    .eq('id', input.serviceId)
    .eq('organization_id', access.organizationId)
    .single();

  if (serviceError || !serviceRow) {
    return { success: false, error: 'Servizio specificato non valido o inesistente nel tenant.' };
  }

  const startDate = new Date(input.startAt);
  if (isNaN(startDate.getTime())) {
    return { success: false, error: 'Data e ora di inizio non valide.' };
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
        error: 'Conflitto di orario (Double-Booking bloccato meccanicamente). Il professionista selezionato è già impegnato in un appuntamento confermato nel periodo indicato.' 
      };
    }
    return { success: false, error: `Impossibile agendare l'appuntamento: ${error?.message || 'Errore DB'}` };
  }

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'CREATE_APPOINTMENT', entityType: 'appointment', entityId: created.id,
    afterData: { ...insertPayload }, correlationId,
  }, adminClient, log);

  log.info('Appointment scheduled cleanly and checked against GIST anti-overlap constraint', { id: created.id });
  return {
    success: true,
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
): Promise<{ success: boolean; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti.' };
  }

  const { data: existing, error: fetchErr } = await client
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) return { success: false, error: 'Appuntamento non trovato nel tenant.' };

  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'cancelled' && cancellationReason) {
    updatePayload.cancellation_reason = cancellationReason;
  }

  const { error } = await client
    .from('appointments')
    .update(updatePayload)
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId);

  if (error) return { success: false, error: `Impossibile aggiornare lo stato: ${error.message}` };

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: `UPDATE_APPOINTMENT_STATUS_${newStatus.toUpperCase()}`, entityType: 'appointment', entityId: appointmentId,
    beforeData: { status: existing.status }, afterData: updatePayload, correlationId,
  }, adminClient, log);

  return { success: true };
}

export async function rescheduleAppointment(
  client: SupabaseClient, adminClient: SupabaseClient, userId: string, organizationSlug: string,
  appointmentId: string, newStartAt: string, correlationId: string, logger?: Logger
): Promise<{ success: boolean; data?: Appointment; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Permessi insufficienti per riprogrammare appuntamenti.' };
  }

  // 1. Fetch existing appointment to get service_id, professional_id, status, etc.
  const { data: existing, error: fetchErr } = await client
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: 'Appuntamento non trovato.' };
  }

  // 2. Fetch service to get duration_minutes
  const { data: serviceRow, error: serviceError } = await client
    .from('services')
    .select('duration_minutes')
    .eq('id', existing.service_id)
    .eq('organization_id', access.organizationId)
    .single();

  if (serviceError || !serviceRow) {
    return { success: false, error: 'Servizio dell\'appuntamento non valido.' };
  }

  const startDate = new Date(newStartAt);
  if (isNaN(startDate.getTime())) {
    return { success: false, error: 'Nuova data e ora di inizio non valida.' };
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
        error: 'Conflitto di orario (Double-Booking bloccato meccanicamente). Il professionista selezionato è già impegnato in un appuntamento confermato nel periodo indicato.' 
      };
    }
    return { success: false, error: `Impossibile spostare l'appuntamento: ${updateError?.message || 'Errore DB'}` };
  }

  await recordAuditLog({
    organizationId: access.organizationId, actorUserId: userId, actorType: 'user',
    action: 'RESCHEDULE_APPOINTMENT', entityType: 'appointment', entityId: appointmentId,
    beforeData, afterData: updatePayload, correlationId,
  }, adminClient, log);

  return {
    success: true,
    data: {
      id: updated.id, organizationId: updated.organization_id, customerId: updated.customer_id,
      serviceId: updated.service_id, professionalId: updated.professional_id,
      startAt: updated.start_at, endAt: updated.end_at, status: updated.status,
      notes: updated.notes, cancellationReason: updated.cancellation_reason || null, heldUntil: null,
      createdAt: updated.created_at, updatedAt: updated.updated_at,
    }
  };
}
