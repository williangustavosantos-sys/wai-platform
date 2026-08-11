import React from 'react';
import { createServerClient } from '@/db/server';
import { getCurrentSession, verifyOrganizationAccess } from '@/security/auth';
import { listServices, listProfessionals, listTimeSlots, listAppointments } from '@/modules/calendar/calendar.service';
import { listCustomers } from '@/modules/crm/crm.service';
import { listBusinessExceptions } from '@/modules/rules/rules.service';
import { formatOrganizationMonth, getOrganizationMonth, getOrganizationMonthRange, isOrganizationMonth } from '@/modules/shared/organization-timezone';
import { getAdjacentMonths } from './calendar-view-model';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarView } from './CalendarView';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const requestedMonth = (await searchParams).month;
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

  const month = isOrganizationMonth(requestedMonth) ? requestedMonth : getOrganizationMonth(new Date(), access.timezone);
  const monthRange = getOrganizationMonthRange(month, access.timezone);
  const readOnly = access.role === 'organization_viewer';
  const [services, professionals, timeSlots, appointments, exceptions, customers] = await Promise.all([
    listServices(supabase, session.userId, slug, { includeInactive: !readOnly }),
    listProfessionals(supabase, session.userId, slug, { includeInactive: !readOnly }),
    listTimeSlots(supabase, session.userId, slug),
    listAppointments(supabase, session.userId, slug, monthRange),
    listBusinessExceptions(supabase, session.userId, slug, monthRange),
    listCustomers(supabase, session.userId, slug),
  ]);
  const adjacentMonths = getAdjacentMonths(month);

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="wai-title">Calendario</h1>
            <p className="wai-subtitle">
              {formatOrganizationMonth(month, access.timezone, access.locale)} · orari e intervalli in {access.timezone}.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Link className="wai-button wai-button-secondary" href={`/app/${slug}/calendar?month=${adjacentMonths.previous}`}>← Mese precedente</Link>
              <Link className="wai-button wai-button-secondary" href={`/app/${slug}/calendar?month=${getOrganizationMonth(new Date(), access.timezone)}`}>Mese corrente</Link>
              <Link className="wai-button wai-button-secondary" href={`/app/${slug}/calendar?month=${adjacentMonths.next}`}>Mese successivo →</Link>
            </div>
          </div>
          <span className="wai-badge" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#C4B5FD', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            Agenda operativa
          </span>
        </div>
      </div>

      <CalendarView
        organizationSlug={slug}
        services={services}
        professionals={professionals}
        timeSlots={timeSlots}
        appointments={appointments}
        exceptions={exceptions}
        customers={customers}
        month={month}
        timezone={access.timezone}
        readOnly={readOnly}
      />
    </div>
  );
}
