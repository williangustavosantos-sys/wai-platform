import { describe, expect, it } from 'vitest';
import {
  formatOrganizationDateTime,
  getOrganizationDayRange,
  getOrganizationMonth,
  getOrganizationMonthRange,
  organizationLocalDateTimeToUtc,
  toOrganizationDateTimeInput,
} from '@/modules/shared/organization-timezone';

describe('organization timezone utilities', () => {
  it('uses the organization timezone for current month selection', () => {
    expect(getOrganizationMonth(new Date('2026-03-01T00:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-02');
    expect(getOrganizationMonth(new Date('2026-03-01T00:30:00.000Z'), 'Europe/Rome')).toBe('2026-03');
  });

  it('builds a month range at organization-local midnight across DST', () => {
    const range = getOrganizationMonthRange('2026-03', 'Europe/Rome');

    expect(range.startAt).toBe('2026-02-28T23:00:00.000Z');
    expect(range.endAt).toBe('2026-03-31T22:00:00.000Z');
  });

  it('converts organization-local appointment input without browser timezone', () => {
    expect(organizationLocalDateTimeToUtc('2026-08-14T09:30', 'Europe/Rome')).toBe('2026-08-14T07:30:00.000Z');
    expect(toOrganizationDateTimeInput('2026-08-14T07:30:00.000Z', 'Europe/Rome')).toBe('2026-08-14T09:30');
  });

  it('rejects a non-existent local datetime during daylight-saving transition', () => {
    expect(organizationLocalDateTimeToUtc('2026-03-29T02:30', 'Europe/Rome')).toBeNull();
  });

  it('uses organization day ranges and display formatting', () => {
    expect(getOrganizationDayRange('2026-10-25', 'Europe/Rome')).toEqual({
      date: '2026-10-25',
      startAt: '2026-10-24T22:00:00.000Z',
      endAt: '2026-10-25T23:00:00.000Z',
    });
    expect(formatOrganizationDateTime('2026-08-14T07:30:00.000Z', 'Europe/Rome')).toContain('09:30');
  });

  it('rejects impossible calendar dates before calculating a business interval', () => {
    expect(() => getOrganizationDayRange('2026-02-31', 'Europe/Rome')).toThrow('Data organizacional inválida');
  });
});
