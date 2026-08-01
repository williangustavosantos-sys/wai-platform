import React from 'react';
import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession, isWaiAdmin } from '@/security/auth';
import { listAllOrganizationsForAdmin } from '@/modules/organizations/organization.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { logoutAction } from '@/app/login/actions';

export default async function AdminDashboardPage() {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const admin = await isWaiAdmin(supabase, session.userId);
  if (!admin) {
    // Standard user accessing global admin route -> Access Denied / Redirect per requirements
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card wai-alert-error">
          <h2>Accesso Negato</h2>
          <p style={{ marginTop: '0.5rem' }}>Questa sezione è strettamente riservata agli amministratori globali WAI Platform.</p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Torna alla tua Organizzazione</Link>
        </div>
      </div>
    );
  }

  // Admin verified -> fetch global organization list using server-side admin client
  const adminClient = createAdminClient();
  const organizations = await listAllOrganizationsForAdmin(adminClient);

  return (
    <div>
      <nav className="wai-navbar">
        <div className="wai-logo">WAI ADMIN CONSOLE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span className="wai-badge">Amministratore Globale</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{session.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="wai-button wai-button-secondary" style={{ padding: '0.5rem 1rem' }}>Esci</button>
          </form>
        </div>
      </nav>

      <main className="wai-container">
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="wai-title">Gestione Organizzazioni (Tenant)</h1>
          <p className="wai-subtitle">Panoramica delle imprese ospitate sulla piattaforma ed isolamento di sicurezza RLS</p>
        </div>

        <div className="wai-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>Elenco Imprese Registrate</h2>
          
          {organizations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nessuna organizzazione registrata al momento.</p>
          ) : (
            <table className="wai-table">
              <thead>
                <tr>
                  <th>Nome Organizzazione</th>
                  <th>Identificativo Slug</th>
                  <th>Fuso Orario</th>
                  <th>Lingua</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org: any) => (
                  <tr key={org.id}>
                    <td style={{ fontWeight: '600', color: '#fff' }}>{org.name}</td>
                    <td><code style={{ background: 'var(--bg-input)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>{org.slug}</code></td>
                    <td>{org.timezone}</td>
                    <td>{org.locale}</td>
                    <td>
                      <span style={{ color: 'var(--success-color)', fontWeight: '600' }}>
                        ● {org.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <Link href={`/admin/organizations/${org.slug}`} style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
                        Dettagli & Setup →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="wai-card" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: '#1e293b' }}>
          <h3 style={{ fontSize: '1rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>
            Sicurezza & Isolamento Dati
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6' }}>
            Ogni organizzazione sopra elencata opera all&apos;interno di un contesto isolato tramite Row Level Security (RLS) direttamente nel database PostgreSQL. Nessuna interrogazione client-side può trasgredire i confini di tenant.
          </p>
        </div>
      </main>
    </div>
  );
}
