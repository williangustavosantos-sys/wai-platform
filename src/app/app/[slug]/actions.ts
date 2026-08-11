'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { updateOrganizationSettings } from '@/modules/organizations/organization.service';
import { revalidatePath } from 'next/cache';

export async function updateSettingsAction(organizationSlug: string, formData: FormData) {
  const businessName = formData.get('businessName') as string;
  const address = (formData.get('address') as string) || '';
  const phone = (formData.get('phone') as string) || '';
  const email = (formData.get('email') as string) || '';
  const workingHours = (formData.get('workingHours') as string) || '';
  const themePreference = (formData.get('themePreference') as 'institutional' | 'balanced' | 'cool') || 'institutional';
  const locale = (formData.get('locale') as string) || 'it-IT';
  const correlationId = crypto.randomUUID();

  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();
  
  const result = await updateOrganizationSettings(
    supabase,
    adminClient,
    session.userId,
    organizationSlug,
    { businessName, address, phone, email, workingHours, themePreference, locale },
    correlationId
  );

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath(`/app/${organizationSlug}`, 'layout');
  return { success: true, message: 'Configurazione aziendale aggiornata e registrata nell’Audit Log.' };
}
