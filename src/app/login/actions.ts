'use server';

import { createServerClient } from '@/db/server';
import { logger } from '@/logging/logger';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const correlationId = crypto.randomUUID();

  if (!email || !password) {
    return { error: 'Inserisci indirizzo email e password validi.' };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logger.warn('Failed login attempt', { correlationId, email, error: error.message });
    return { error: 'Credenziali non valide o accesso negato.' };
  }

  logger.info('Successful login', { correlationId, email });
  redirect('/');
}

export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
