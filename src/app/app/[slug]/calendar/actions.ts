'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { createService, createProfessional, createTimeSlot, createAppointment, updateAppointmentStatus } from '@/modules/calendar/calendar.service';
import { AppointmentStatus } from '@/modules/calendar/calendar.types';
import { revalidatePath } from 'next/cache';

export async function createServiceAction(organizationSlug: string, formData: FormData) {
  const name = formData.get('name') as string;
  const description = (formData.get('description') as string) || undefined;
  const durationMinutes = Number(formData.get('durationMinutes'));
  const price = formData.get('price') ? Number(formData.get('price')) : undefined;

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
  const email = (formData.get('email') as string) || undefined;
  const phone = (formData.get('phone') as string) || undefined;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await createProfessional(supabase, adminClient, session.userId, organizationSlug, { name, email, phone }, correlationId);
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

  const adminClient = createAdminClient();
  const res = await createAppointment(supabase, adminClient, session.userId, organizationSlug, { customerId, serviceId, professionalId, startAt, notes }, correlationId);
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
