import React from 'react';
import { createServerClient, createAdminClient } from '@/db/server';
import { getCurrentSession, isWaiAdmin } from '@/security/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminOrgDetailsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const admin = await isWaiAdmin(supabase, session.userId);
  if (!admin) {
    redirect('/');
  }

  const adminClient = createAdminClient();
  const { data: org } = await adminClient
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!org) {
    return (
      <div className="wai-container" style={{ marginTop: '3rem' }}>
        <div className="wai-card">
          <p>Organizzazione non trovata per lo slug: <strong>{slug}</strong></p>
          <Link href="/admin" className="wai-button" style={{ marginTop: '1rem' }}>Torna alla Dashboard</Link>
        </div>
      </div>
    );
  }

  const { data: members } = await adminClient
    .from('organization_members')
    .select('role, status, user_id, platform_users(email, global_role)')
    .eq('organization_id', org.id);

  const { data: auditLogs } = await adminClient
    .from('audit_logs')
    .select('id, action, actor_type, created_at, before_data, after_data, correlation_id')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <nav className="wai-navbar">
        <div className="wai-logo">WAI ADMIN CONSOLE</div>
        <Link href="/admin" style={{ color: 'var(--text-muted)' }}>← Torna all&apos;Elenco</Link>
      </nav>

      <main className="wai-container">
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 className="wai-title" style={{ margin: 0 }}>{org.name}</h1>
            <span className="wai-badge">Tenant Isolato</span>
          </div>
          <p className="wai-subtitle">Slug Identificativo: <code>{org.slug}</code> | Fuso Orario: <code>{org.timezone}</code></p>
        </div>

        <div className="wai-card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Membri dell&apos;Organizzazione</h2>
          <table className="wai-table">
            <thead>
              <tr>
                <th>Utente / Email</th>
                <th>Ruolo nel Tenant</th>
                <th>Stato Membership</th>
              </tr>
            </thead>
            <tbody>
              {(members || []).map((m: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: '600' }}>
                    {m.platform_users && typeof m.platform_users === 'object' && 'email' in m.platform_users 
                      ? (m.platform_users as { email: string }).email 
                      : m.user_id}
                  </td>
                  <td><span className="wai-badge wai-badge-owner">{m.role}</span></td>
                  <td style={{ color: 'var(--success-color)' }}>● {m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wai-card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Audit Log Recenti (Immutabili)</h2>
          {(auditLogs || []).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nessuna modifica recente registrata per questo tenant.</p>
          ) : (
            <table className="wai-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Data e Ora</th>
                  <th>Azione Eseguita</th>
                  <th>Atore</th>
                  <th>ID Correlazione (Trace)</th>
                </tr>
              </thead>
              <tbody>
                {(auditLogs || []).map((log: any) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('it-IT')}</td>
                    <td style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{log.action}</td>
                    <td>{log.actor_type}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{log.correlation_id}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
