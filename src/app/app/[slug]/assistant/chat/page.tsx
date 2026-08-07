import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ChatSimulatorView from './ChatSimulatorView';

interface Props {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: 'Simulatore WAI & Inspector — Work Artificial Intelligence',
  description: 'Ambiente di test e dimostrazione commerciale per l assistente digitale WAI interconnesso ad agenda GIST e CRM RLS.',
};

export default async function ChatSimulatorPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const access = await verifyOrganizationAccess(supabase, session.userId, slug);

  if (!access) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center font-sans">
        <div className="max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Accesso Negato all&apos;Organizzazione</h2>
          <p className="text-sm text-slate-400 mb-6">
            Non disponi delle credenziali RLS e del ruolo operativo necessari per interagire con l&apos;assistente digitale di questo tenant.
          </p>
          <Link
            href={`/app/${slug}`}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition inline-block border border-slate-700"
          >
            Torna al Pannello Tenant
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="wai-chat-page">
      <div className="wai-chat-breadcrumb">
        <Link href={`/app/${slug}`} className="wai-chat-breadcrumb-link">
          <svg width="16" height="16" style={{ width: '16px', height: '16px', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Torna al Pannello di {slug.toUpperCase()}
        </Link>
        <span style={{ opacity: 0.4 }}>•</span>
        <Link href={`/app/${slug}/assistant`} className="wai-chat-breadcrumb-link">
          Configurazione Assistente
        </Link>
      </div>
      <ChatSimulatorView organizationSlug={slug} />
    </main>
  );
}
