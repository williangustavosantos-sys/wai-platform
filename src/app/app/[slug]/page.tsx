import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';
import { SettingsForm } from './SettingsForm';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TenantWorkspacePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  // Strictly verify organization access server-side
  const access = await verifyOrganizationAccess(supabase, session.userId, slug);

  if (!access) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Accesso Negato o Tenant Inesistente</h2>
          <p style={{ marginTop: '0.5rem' }}>
            Non risulti tra i membri attivi dell&apos;organizzazione <strong>{slug}</strong>. Il tentativo è stato bloccato dai criteri di isolamento RLS.
          </p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
            Torna all&apos;Inizio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <nav className="wai-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="wai-logo">WAI TENANT</div>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontWeight: '600', color: '#fff' }}>{access.organizationName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span className="wai-badge wai-badge-owner">{access.role}</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{session.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="wai-button wai-button-secondary" style={{ padding: '0.5rem 1rem' }}>
              Esci
            </button>
          </form>
        </div>
      </nav>

      <main className="wai-container">
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="wai-title">{access.organizationName}</h1>
          <p className="wai-subtitle">
            Spazio di Lavoro Aziendale (Fase 0 Fondazione) | Ambiente Isolato e Sicuro
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="wai-card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
              Parametri Organizzazione
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.95rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '140px' }}>Identificativo Slug:</span>
                <code>{access.organizationSlug}</code>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '140px' }}>Fuso Orario:</span>
                <strong>{access.timezone}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '140px' }}>Lingua Interna:</span>
                <strong>{access.locale}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '140px' }}>Livello Accesso:</span>
                <span style={{ color: 'var(--success-color)', fontWeight: '600' }}>{access.role.toUpperCase()}</span>
              </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Stato di Funzionalità (Fase 0)
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                I moduli di Agenda, Motore IA, Simulatore ed Integrazione WhatsApp sono volontariamente disabilitati in attesa del completamento formale e validazione di questa fondazione multi-tenant.
              </p>
            </div>
          </div>

          <div className="wai-card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
              Configurazione & Registro Audizione
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Modifica le impostazioni di base per verificare il funzionamento del sistema di audizione (Audit Log) che salva lo stato prima e dopo la modifica in modo immutabile.
            </p>
            <SettingsForm organizationSlug={access.organizationSlug} initialSettings={access.settingsJson} />
          </div>
        </div>
      </main>
    </div>
  );
}
