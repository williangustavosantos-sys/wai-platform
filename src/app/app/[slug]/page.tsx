import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SettingsForm } from './SettingsForm';
import { getAdminLanguage, getDictionary } from '@/i18n';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TenantWorkspacePage({ params }: Props) {
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
    return null; // Handled by layout.tsx
  }

  const modules = [
    {
      title: dict.dashboard.modules.assistant_title,
      desc: dict.dashboard.modules.assistant_desc,
      href: `/app/${slug}/assistant`,
      icon: '🤖',
      badge: 'Fase 1'
    },
    {
      title: dict.dashboard.modules.crm_title,
      desc: dict.dashboard.modules.crm_desc,
      href: `/app/${slug}/crm`,
      icon: '👥',
      badge: 'Fase 1'
    },
    {
      title: dict.dashboard.modules.calendar_title,
      desc: dict.dashboard.modules.calendar_desc,
      href: `/app/${slug}/calendar`,
      icon: '📅',
      badge: 'Fase 1'
    },
    {
      title: dict.dashboard.modules.rules_title,
      desc: dict.dashboard.modules.rules_desc,
      href: `/app/${slug}/rules`,
      icon: '⚙️',
      badge: 'Fase 1'
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 className="wai-title">{access.organizationName}</h1>
        <p className="wai-subtitle">
          {dict.dashboard.subtitle}
        </p>
      </div>

      {/* Operational Core Modules Grid */}
      <h3 style={{ fontSize: '1.2rem', color: '#E2E8F0', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
        {dict.dashboard.modules_title}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        {modules.map(m => (
          <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
            <div className="wai-card" style={{ 
              height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              border: '1px solid rgba(255,255,255,0.08)', transition: 'border-color 0.2s, transform 0.2s',
              cursor: 'pointer'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <span style={{ fontSize: '1.8rem' }}>{m.icon}</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93C5FD', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    {m.badge}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>{m.title}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#94A3B8', lineHeight: 1.5 }}>{m.desc}</p>
              </div>
              <div style={{ marginTop: '1.2rem', color: '#60A5FA', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {dict.dashboard.access_module} <span>→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Tenant Properties & Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="wai-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
            {dict.dashboard.tenant_params.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.95rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '150px' }}>{dict.dashboard.tenant_params.slug_label}</span>
              <code>{access.organizationSlug}</code>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '150px' }}>{dict.dashboard.tenant_params.timezone_label}</span>
              <strong>{access.timezone}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '150px' }}>{dict.dashboard.tenant_params.locale_label}</span>
              <strong>{access.locale}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: '150px' }}>{dict.dashboard.tenant_params.access_level_label}</span>
              <span style={{ color: '#10B981', fontWeight: '600' }}>{access.role.toUpperCase()}</span>
            </div>
          </div>

          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              {dict.dashboard.tenant_params.integrations_title}
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
              {dict.dashboard.tenant_params.integrations_desc}
            </p>
          </div>
        </div>

        <div className="wai-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
            {dict.dashboard.settings_card.title}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {dict.dashboard.settings_card.desc}
          </p>
          <SettingsForm organizationSlug={access.organizationSlug} organizationName={access.organizationName} initialSettings={access.settingsJson} locale={access.locale} dict={dict.settings_form} />
        </div>
      </div>
    </div>
  );
}
