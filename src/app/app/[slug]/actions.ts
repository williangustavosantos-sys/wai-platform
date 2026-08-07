'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { updateOrganizationSettings } from '@/modules/organizations/organization.service';
import { revalidatePath } from 'next/cache';

export async function updateSettingsAction(organizationSlug: string, formData: FormData) {
  const displayName = formData.get('displayName') as string;
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
    { displayName, themePreference, locale },
    correlationId
  );

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath(`/app/${organizationSlug}`);
  return { success: true, message: 'Impostazioni aggiornate con successo e registrate nel registro di audizione (Audit Log).' };
}
