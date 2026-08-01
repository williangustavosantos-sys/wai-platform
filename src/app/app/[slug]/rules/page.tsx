import React from 'react';
import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { getBusinessRulesConfig, listBusinessExceptions } from '@/modules/rules/rules.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { RulesView } from './RulesView';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RulesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const access = await verifyOrganizationAccess(supabase, session.userId, slug);

  if (!access) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Accesso Negato all&apos;Organizzazione</h2>
          <p style={{ marginTop: '0.5rem' }}>Non hai i permessi RLS per accedere alla configurazione delle regole di business del tenant.</p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Torna alla Home</Link>
        </div>
      </div>
    );
  }

  const adminClient = createAdminClient();
  const correlationId = crypto.randomUUID();
  
  const [config, exceptions] = await Promise.all([
    getBusinessRulesConfig(supabase, adminClient, session.userId, slug, correlationId),
    listBusinessExceptions(supabase, session.userId, slug)
  ]);

  if (!config) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Impossibile Caricare le Regole e Politiche Aziendali</h2>
          <p>Verifica di disporre dei permessi operativi (Owner/Operator) all&apos;interno dell&apos;organizzazione.</p>
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
            <h1 className="wai-title">Motore di Regole & Politiche (Business Rules Engine)</h1>
            <p className="wai-subtitle">
              Definisci le finestre di cancellazione, i parametri operativi di prenotazione online e i modelli di comunicazione di base.
            </p>
          </div>
          <span className="wai-badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            Módulo 4 (Fase 1)
          </span>
        </div>
      </div>

      <RulesView organizationSlug={slug} initialConfig={config} initialExceptions={exceptions} readOnly={readOnly} />
    </div>
  );
}
