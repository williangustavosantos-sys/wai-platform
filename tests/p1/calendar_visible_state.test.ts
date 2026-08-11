import { describe, expect, it } from 'vitest';
import { buildMonthlyCalendar } from '../../src/app/app/[slug]/calendar/calendar-view-model';
import type { Appointment } from '../../src/modules/calendar/calendar.types';
import type { BusinessException } from '../../src/modules/rules/rules.types';

const appointment: Appointment = {
  id: 'appointment-1', organizationId: 'org-1', customerId: 'customer-1', serviceId: 'service-1', professionalId: 'professional-1',
  startAt: '2026-03-31T22:30:00.000Z', endAt: '2026-03-31T23:15:00.000Z', status: 'confirmed', notes: null,
  cancellationReason: null, heldUntil: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  customerName: 'Cliente QA', serviceName: 'Servizio QA', professionalName: 'Professionista QA',
};

describe('P1 monthly calendar visible state', () => {
  it('places appointments on the organization-local day rather than the browser or UTC day', () => {
    const model = buildMonthlyCalendar('2026-04', 'Europe/Rome', [appointment], []);
    expect(model.days.find((day) => day.date === '2026-04-01')?.appointments).toEqual([appointment]);
  });

  it('returns an empty monthly appointment presentation when the month has no records', () => {
    const model = buildMonthlyCalendar('2026-04', 'Europe/Rome', [], []);
    expect(model.days.flatMap((day) => day.appointments)).toEqual([]);
  });

  it('exposes a persisted full-day business exception on the impacted local day', () => {
    const block: BusinessException = {
      id: 'block-1', organizationId: 'org-1', startDate: '2026-04-14T22:00:00.000Z', endDate: '2026-04-15T22:00:00.000Z',
      reason: 'Blocco QA', isFullDay: true, createdAt: '2026-01-01T00:00:00.000Z',
    };
    const model = buildMonthlyCalendar('2026-04', 'Europe/Rome', [], [block]);
    expect(model.days.find((day) => day.date === '2026-04-15')?.exceptions).toEqual([block]);
  });
});
