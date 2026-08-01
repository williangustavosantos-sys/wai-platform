import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { listServices, listProfessionals, listTimeSlots, listAppointments } from '@/modules/calendar/calendar.service';
import { listCustomers } from '@/modules/crm/crm.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarView } from './CalendarView';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CalendarPage({ params }: Props) {
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
          <p style={{ marginTop: '0.5rem' }}>Non hai i permessi RLS per visualizzare l&apos;agenda operativa di questo tenant.</p>
          <Link href="/" className="wai-button" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Torna alla Home</Link>
        </div>
      </div>
    );
  }

  const [services, professionals, timeSlots, appointments, customers] = await Promise.all([
    listServices(supabase, session.userId, slug),
    listProfessionals(supabase, session.userId, slug),
    listTimeSlots(supabase, session.userId, slug),
    listAppointments(supabase, session.userId, slug),
    listCustomers(supabase, session.userId, slug),
  ]);

  const readOnly = access.role === 'organization_viewer';

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="wai-title">Motore di Agenda WAI</h1>
            <p className="wai-subtitle">
              Gestione appuntamenti, servizi e turni di disponibilità. Dotato di vincolo GIST a livello di database contro sovrapposizioni d&apos;orario (zero double-booking).
            </p>
          </div>
          <span className="wai-badge" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#C4B5FD', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            Módulo 3 (Fase 1)
          </span>
        </div>
      </div>

      <CalendarView
        organizationSlug={slug}
        services={services}
        professionals={professionals}
        timeSlots={timeSlots}
        appointments={appointments}
        customers={customers}
        readOnly={readOnly}
      />
    </div>
  );
}
