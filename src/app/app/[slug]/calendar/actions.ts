'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { createService, updateService, createProfessional, updateProfessional, createTimeSlot, createAppointment, updateAppointmentStatus, rescheduleAppointment } from '@/modules/calendar/calendar.service';
import { AppointmentStatus } from '@/modules/calendar/calendar.types';
import { createBusinessException } from '@/modules/rules/rules.service';
import { organizationLocalDateTimeToUtc } from '@/modules/shared/organization-timezone';
import { revalidatePath } from 'next/cache';

export async function createServiceAction(organizationSlug: string, formData: FormData) {
  const name = formData.get('name') as string;
  const description = (formData.get('description') as string) || undefined;
  const durationMinutes = Number(formData.get('durationMinutes'));
  const priceInput = formData.get('price');
  const price = typeof priceInput === 'string' && priceInput.trim() ? Math.round(Number(priceInput) * 100) : 0;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta o utente non autenticato.' };

  const adminClient = createAdminClient();
  const res = await createService(supabase, adminClient, session.userId, organizationSlug, { name, description, durationMinutes, price }, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Nuovo servizio registrato correttamente nel tenant.' };
}

export async function createProfessionalAction(organizationSlug: string, formData: FormData) {
  const name = formData.get('name') as string;
  const title = (formData.get('title') as string) || undefined;
  const email = (formData.get('email') as string) || undefined;
  const phone = (formData.get('phone') as string) || undefined;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await createProfessional(supabase, adminClient, session.userId, organizationSlug, { name, title, email, phone }, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Professionista aggiunto con successo.' };
}

export async function createTimeSlotAction(organizationSlug: string, formData: FormData) {
  const professionalId = formData.get('professionalId') as string;
  const dayOfWeek = Number(formData.get('dayOfWeek'));
  const startTime = formData.get('startTime') as string;
  const endTime = formData.get('endTime') as string;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await createTimeSlot(supabase, adminClient, session.userId, organizationSlug, { professionalId, dayOfWeek, startTime, endTime }, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Fascia oraria di disponibilità registrata.' };
}

export async function createAppointmentAction(organizationSlug: string, formData: FormData) {
  const customerId = formData.get('customerId') as string;
  const serviceId = formData.get('serviceId') as string;
  const professionalId = formData.get('professionalId') as string;
  const startAt = formData.get('startAt') as string;
  const notes = (formData.get('notes') as string) || undefined;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const access = await verifyOrganizationAccess(supabase, session.userId, organizationSlug);
  if (!access) return { error: 'Accesso negato a questa organizzazione.' };
  const startAtUtc = organizationLocalDateTimeToUtc(startAt, access.timezone);
  if (!startAtUtc) return { error: 'La data o l’ora non è valida nel fuso orario dell’azienda.' };

  const adminClient = createAdminClient();
  const res = await createAppointment(supabase, adminClient, session.userId, organizationSlug, { customerId, serviceId, professionalId, startAt: startAtUtc, notes }, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Appuntamento confermato e verificato contro sovrapposizioni d\'orario (GIST anti-overlap).' };
}

export async function updateAppointmentStatusAction(organizationSlug: string, appointmentId: string, status: AppointmentStatus, cancellationReason?: string) {
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await updateAppointmentStatus(supabase, adminClient, session.userId, organizationSlug, appointmentId, status, cancellationReason || null, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: `Stato dell'appuntamento aggiornato a '${status.toUpperCase()}' nel registro Audit.` };
}

export async function updateServiceAction(organizationSlug: string, serviceId: string, formData: FormData) {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };
  const priceInput = formData.get('price');
  const price = typeof priceInput === 'string' && priceInput.trim() ? Math.round(Number(priceInput) * 100) : 0;
  const res = await updateService(supabase, createAdminClient(), session.userId, organizationSlug, serviceId, {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    durationMinutes: Number(formData.get('durationMinutes')),
    price,
    status: formData.get('status') as 'active' | 'inactive',
  }, crypto.randomUUID());
  if (!res.success) return { error: res.error };
  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Servizio aggiornato.' };
}

export async function updateProfessionalAction(organizationSlug: string, professionalId: string, formData: FormData) {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };
  const res = await updateProfessional(supabase, createAdminClient(), session.userId, organizationSlug, professionalId, {
    name: formData.get('name') as string,
    title: (formData.get('title') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    status: formData.get('status') as 'active' | 'inactive',
  }, crypto.randomUUID());
  if (!res.success) return { error: res.error };
  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Professionista aggiornato.' };
}

export async function rescheduleAppointmentAction(organizationSlug: string, appointmentId: string, localStartAt: string) {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };
  const access = await verifyOrganizationAccess(supabase, session.userId, organizationSlug);
  if (!access) return { error: 'Accesso negato a questa organizzazione.' };
  const newStartAt = organizationLocalDateTimeToUtc(localStartAt, access.timezone);
  if (!newStartAt) return { error: 'La nuova data o ora non è valida nel fuso orario dell’azienda.' };
  const res = await rescheduleAppointment(supabase, createAdminClient(), session.userId, organizationSlug, appointmentId, newStartAt, crypto.randomUUID());
  if (!res.success) return { error: res.code === 'SLOT_OCCUPIED' ? 'SLOT_OCCUPIED' : res.error };
  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Appuntamento riprogrammato.' };
}

export async function createBusinessBlockAction(organizationSlug: string, formData: FormData) {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };
  const startDate = formData.get('startAt') as string;
  const endDate = formData.get('endAt') as string;
  const reason = formData.get('reason') as string;
  const isFullDay = formData.get('isFullDay') === 'true';
  const res = await createBusinessException(supabase, createAdminClient(), session.userId, organizationSlug, {
    startDate, endDate, reason, isFullDay,
  }, crypto.randomUUID());
  if (!res.success) return { error: res.error };
  revalidatePath(`/app/${organizationSlug}/calendar`);
  return { success: true, message: 'Blocco calendario registrato.' };
}
