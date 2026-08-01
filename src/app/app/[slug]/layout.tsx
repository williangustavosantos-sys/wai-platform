import React, { ReactNode } from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';
import { TenantNavTabs } from './TenantNavTabs';

interface Props {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function TenantLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const access = await verifyOrganizationAccess(supabase, session.userId, slug);

  if (!access) {
    return (
      <div className="wai-container" style={{ marginTop: '4rem' }}>
        <div className="wai-card wai-alert-error" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h2 style={{ color: '#FCA5A5', marginBottom: '1rem' }}>Accesso Negato all&apos;Organizzazione ({slug})</h2>
          <p style={{ color: '#CBD5E1', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            Non risulti tra i membri attivi del tenant selezionato. I criteri di sicurezza RLS impediscono l&apos;accesso alle tabelle operative e di configurazione.
          </p>
          <Link href="/" className="wai-button" style={{ display: 'inline-block' }}>
            Torna alla Home Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-body, #0A0F1D)' }}>
      {/* Top Navbar */}
      <nav className="wai-navbar" style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <Link href={`/app/${slug}`} style={{ textDecoration: 'none' }}>
            <span className="wai-logo" style={{ background: 'linear-gradient(90deg, #3B82F6, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.5px' }}>
              WAI PLATFORM
            </span>
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontWeight: '600', color: '#fff', fontSize: '1.05rem' }}>{access.organizationName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span className="wai-badge wai-badge-owner" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93C5FD' }}>
            {access.role.replace('organization_', '').toUpperCase()}
          </span>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{session.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="wai-button wai-button-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
              Esci
            </button>
          </form>
        </div>
      </nav>

      {/* Secondary Tenant Navigation Tabs */}
      <TenantNavTabs organizationSlug={slug} />

      {/* Workspace Body */}
      <main className="wai-container" style={{ flex: 1, paddingBottom: '4rem' }}>
        {children}
      </main>
    </div>
  );
}
