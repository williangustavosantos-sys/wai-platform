'use server';

import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession } from '@/security/auth';
import { processConversationTurn } from '@/modules/conversation/conversation.service';
import { WebChatAdapter } from '@/modules/conversation/webchat_adapter';
import { listConversations, listMessages, createConversation } from '@/modules/messages/messages.service';
import { revalidatePath } from 'next/cache';

export async function sendChatMessageAction(
  organizationSlug: string,
  text: string,
  conversationId?: string
) {
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Sessione scaduta o utente non autenticato.' };
  }

  const adminClient = createAdminClient();
  const adapter = new WebChatAdapter();

  try {
    const result = await processConversationTurn(
      supabase,
      adminClient,
      session.userId,
      organizationSlug,
      adapter,
      { conversationId, text },
      correlationId
    );

    revalidatePath(`/app/${organizationSlug}/assistant/chat`);
    return { success: true, result };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Errore imprevisto durante la comunicazione con il motore WAI.';
    return { success: false, error: errorMsg };
  }
}

export async function loadConversationStateAction(organizationSlug: string, forceNew: boolean = false) {
  const correlationId = crypto.randomUUID();
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    return { error: 'Non autenticato.' };
  }

  const adminClient = createAdminClient();

  try {
    const conversations = await listConversations(supabase, session.userId, organizationSlug, 'active');
    let targetConv = forceNew ? undefined : conversations.find(c => c.channel === 'webchat');

    if (!targetConv) {
      const created = await createConversation(
        supabase,
        adminClient,
        session.userId,
        organizationSlug,
        { channel: 'webchat', status: 'active' },
        correlationId
      );
      if (!created.success || !created.data) {
        return { error: created.error || 'Impossibile creare conversazione iniziale.' };
      }
      targetConv = created.data;
    }

    const messages = await listMessages(supabase, session.userId, organizationSlug, targetConv.id);
    return { success: true, conversation: targetConv, messages };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Errore caricamento cronologia: ${message}` };
  }
}
