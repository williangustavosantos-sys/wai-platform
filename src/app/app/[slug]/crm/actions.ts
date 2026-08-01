'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { createCustomer, updateCustomer, archiveCustomer } from '@/modules/crm/crm.service';
import { revalidatePath } from 'next/cache';

export async function createCustomerAction(organizationSlug: string, formData: FormData) {
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;
  const phone = formData.get('phone') as string;
  const email = (formData.get('email') as string) || undefined;
  const birthDate = (formData.get('birthDate') as string) || undefined;
  const marketingConsent = formData.get('marketingConsent') === 'on' || formData.get('marketingConsent') === 'true';
  const notes = (formData.get('notes') as string) || undefined;
  
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();
  const res = await createCustomer(
    supabase,
    adminClient,
    session.userId,
    organizationSlug,
    { firstName, lastName, phone, email, birthDate, marketingConsent, notes },
    correlationId
  );

  if (!res.success) {
    return { error: res.error };
  }

  revalidatePath(`/app/${organizationSlug}/crm`);
  return { success: true, message: 'Nuovo cliente registrato con successo con tracciamento di audit.' };
}

export async function updateCustomerAction(organizationSlug: string, customerId: string, formData: FormData) {
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;
  const phone = formData.get('phone') as string;
  const email = (formData.get('email') as string) || null;
  const birthDate = (formData.get('birthDate') as string) || null;
  const marketingConsent = formData.get('marketingConsent') === 'on' || formData.get('marketingConsent') === 'true';
  const notes = (formData.get('notes') as string) || null;
  
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();
  const res = await updateCustomer(
    supabase,
    adminClient,
    session.userId,
    organizationSlug,
    customerId,
    { firstName, lastName, phone, email, birthDate, marketingConsent, notes },
    correlationId
  );

  if (!res.success) {
    return { error: res.error };
  }

  revalidatePath(`/app/${organizationSlug}/crm`);
  return { success: true, message: 'Anagrafica cliente aggiornata e salvata nell\'Audit Log.' };
}

export async function archiveCustomerAction(organizationSlug: string, customerId: string) {
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();
  const res = await archiveCustomer(
    supabase,
    adminClient,
    session.userId,
    organizationSlug,
    customerId,
    correlationId
  );

  if (!res.success) {
    return { error: res.error };
  }

  revalidatePath(`/app/${organizationSlug}/crm`);
  return { success: true, message: 'Cliente archiviato correttamente.' };
}
