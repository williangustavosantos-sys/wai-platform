import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { listCustomers } from '@/modules/crm/crm.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CrmView } from './CrmView';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CrmPage({ params }: Props) {
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
          <p style={{ marginTop: '0.5rem' }}>Non hai i permessi RLS necessari per accedere al CRM di questa azienda.</p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Torna alla Home</Link>
        </div>
      </div>
    );
  }

  const customers = await listCustomers(supabase, session.userId, slug);
  const readOnly = access.role === 'organization_viewer';

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="wai-title">Gestione Clienti (CRM Operativo)</h1>
            <p className="wai-subtitle">
              Anagrafica centralizzata con normalizzazione dei numeri telefonici in standard internazionale E.164 e gestione del consenso marketing.
            </p>
          </div>
          <span className="wai-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            Módulo 2 (Fase 1)
          </span>
        </div>
      </div>

      <CrmView organizationSlug={slug} initialCustomers={customers} readOnly={readOnly} />
    </div>
  );
}
