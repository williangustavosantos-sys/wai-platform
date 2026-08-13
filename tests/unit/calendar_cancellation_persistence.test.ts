import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';

const auditState = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }));

vi.mock('@/security/auth', () => ({
  verifyOrganizationAccess: vi.fn().mockResolvedValue({
    organizationId: 'org-1',
    role: 'organization_owner',
    timezone: 'Europe/Rome',
  }),
}));

vi.mock('@/modules/audit/audit.service', () => ({
  recordAuditLog: vi.fn().mockImplementation(async (entry: Record<string, unknown>) => {
    auditState.entries.push(entry);
    return { success: true };
  }),
}));

import { updateAppointmentStatus } from '../../src/modules/calendar/calendar.service';

describe('P1 appointment cancellation persistence', () => {
  beforeEach(() => {
    auditState.entries = [];
  });

  it('updates only schema-backed columns and keeps the cancellation reason in the audit log', async () => {
    let persistedUpdate: Record<string, unknown> | undefined;
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        expect(table).toBe('appointments');
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'appointment-1', organization_id: 'org-1', status: 'confirmed' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            persistedUpdate = payload;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await updateAppointmentStatus(
      client,
      {} as SupabaseClient,
      'owner-1',
      'organization-one',
      'appointment-1',
      'cancelled',
      'Cliente indisponível',
      'corr-cancel',
    );

    expect(result).toMatchObject({ success: true, code: 'APPOINTMENT_CANCELLED' });
    expect(persistedUpdate).toEqual({ status: 'cancelled' });
    expect(auditState.entries[0]?.afterData).toEqual({
      status: 'cancelled',
      cancellation_reason: 'Cliente indisponível',
    });
  });
});
