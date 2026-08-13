import React from 'react';
import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { getAssistantConfig } from '@/modules/assistant/assistant.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AssistantForm } from './AssistantForm';
import { getAdminLanguage, getDictionary } from '@/i18n';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AssistantPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);
  const adminLang = await getAdminLanguage();
  const dict = getDictionary(adminLang);

  if (!session) {
    redirect('/login');
  }

  const access = await verifyOrganizationAccess(supabase, session.userId, slug);

  if (!access) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Accesso Negato all&apos;Organizzazione</h2>
          <p style={{ marginTop: '0.5rem' }}>Non hai i permessi RLS necessari per accedere a questo ambiente operativo.</p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Torna alla Home</Link>
        </div>
      </div>
    );
  }

  const adminClient = createAdminClient();
  const correlationId = crypto.randomUUID();
  const config = await getAssistantConfig(supabase, adminClient, session.userId, slug, correlationId);

  if (!config) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Impossibile Inizializzare il Collaboratore Digitale</h2>
          <p>Assicurati di disporre dei permessi di Operatore o Proprietario per configurare il modulo.</p>
        </div>
      </div>
    );
  }

  const readOnly = access.role === 'organization_viewer';

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="wai-title">{dict.assistant.title}</h1>
            <p className="wai-subtitle">
              {dict.assistant.subtitle}
            </p>
          </div>
          <span className="wai-badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            P1 · Config
          </span>
        </div>
      </div>

      <AssistantForm organizationSlug={slug} initialConfig={config} readOnly={readOnly} dict={dict.assistant_form} />
    </div>
  );
}
