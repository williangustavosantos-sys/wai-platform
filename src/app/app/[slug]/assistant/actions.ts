'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { updateAssistantConfig } from '@/modules/assistant/assistant.service';
import { CommunicationTone } from '@/modules/assistant/assistant.types';
import { revalidatePath } from 'next/cache';

export async function updateAssistantAction(organizationSlug: string, formData: FormData) {
  const name = formData.get('name') as string;
  const personalitySummary = formData.get('personalitySummary') as string;
  const language = formData.get('language') as string;
  const communicationTone = (formData.get('communicationTone') as CommunicationTone) || 'cordial_empathic';
  const avatarPlaceholderUrl = formData.get('avatarPlaceholderUrl') as string;
  const correlationId = crypto.randomUUID();

  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();

  const result = await updateAssistantConfig(
    supabase,
    adminClient,
    session.userId,
    organizationSlug,
    { name, personalitySummary, language, communicationTone, avatarPlaceholderUrl },
    correlationId
  );

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath(`/app/${organizationSlug}/assistant`);
  return { success: true, message: "Configurazione dell'assistente salvata con successo e registrata nell'Audit Log." };
}
