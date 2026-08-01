'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { updateBusinessRulesConfig, createBusinessException, deleteBusinessException } from '@/modules/rules/rules.service';
import { revalidatePath } from 'next/cache';

export async function updateRulesAction(organizationSlug: string, formData: FormData) {
  const cancellationWindowHours = Number(formData.get('cancellationWindowHours'));
  const maxAdvanceDaysBooking = Number(formData.get('maxAdvanceDaysBooking'));
  const noShowPolicyNote = (formData.get('noShowPolicyNote') as string) || null;
  const welcomeMessage = formData.get('welcomeMessage') as string;
  const confirmationMessageTemplate = formData.get('confirmationMessageTemplate') as string;
  const cancellationMessageTemplate = formData.get('cancellationMessageTemplate') as string;
  const outOfHoursMessage = formData.get('outOfHoursMessage') as string;
  const autoConfirmAppointments = formData.get('autoConfirmAppointments') === 'on' || formData.get('autoConfirmAppointments') === 'true';

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await updateBusinessRulesConfig(
    supabase, adminClient, session.userId, organizationSlug,
    {
      cancellationWindowHours, maxAdvanceDaysBooking, noShowPolicyNote,
      welcomeMessage, confirmationMessageTemplate, cancellationMessageTemplate,
      outOfHoursMessage, autoConfirmAppointments
    },
    correlationId
  );

  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/rules`);
  return { success: true, message: 'Politiche aziendali e messaggi predefiniti salvati con successo e registrati nell\'Audit Log.' };
}

export async function createExceptionAction(organizationSlug: string, formData: FormData) {
  const startDate = formData.get('startDate') as string;
  const endDate = formData.get('endDate') as string;
  const reason = formData.get('reason') as string;
  const isFullDay = true;

  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await createBusinessException(supabase, adminClient, session.userId, organizationSlug, { startDate, endDate, reason, isFullDay }, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/rules`);
  return { success: true, message: 'Periodo di chiusura / eccezione inserito correttamente.' };
}

export async function deleteExceptionAction(organizationSlug: string, exceptionId: string) {
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  if (!session) return { error: 'Sessione scaduta.' };

  const adminClient = createAdminClient();
  const res = await deleteBusinessException(supabase, adminClient, session.userId, organizationSlug, exceptionId, correlationId);
  if (!res.success) return { error: res.error };

  revalidatePath(`/app/${organizationSlug}/rules`);
  return { success: true, message: 'Periodo di chiusura rimosso.' };
}
