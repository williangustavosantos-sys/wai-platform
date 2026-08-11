import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppointment } from '../../src/modules/calendar/calendar.service';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Calendar Engine & Mechanical GIST Anti-Overlap Unit Tests (Fase 1)', () => {
  let mockAdminClient: SupabaseClient;
  let mockUserClient: SupabaseClient;
  let auditLogsStore: unknown[];
  let shouldSimulateGistCollision: boolean;

  beforeEach(() => {
    auditLogsStore = [];
    shouldSimulateGistCollision = false;

    mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((records: unknown[]) => {
              auditLogsStore.push(...records);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'audit-appt-111' }, error: null })
                })
              };
            })
          };
        }
      })
    } as unknown as SupabaseClient;

    const ownedEntityLookup = (data: Record<string, unknown>) => {
      const query = {
        eq: vi.fn(),
        single: vi.fn().mockResolvedValue({ data, error: null })
      };
      query.eq.mockReturnValue(query);
      return { select: vi.fn().mockReturnValue(query) };
    };

    mockUserClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-aurora-id', name: 'Studio Aurora', slug: 'studio-aurora', status: 'active' },
                    error: null
                  })
                }))
              }))
            }))
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    single: vi.fn().mockResolvedValue({ data: { role: 'organization_operator', status: 'active' }, error: null })
                  }))
                }))
              }))
            }))
          };
        }
        if (table === 'customers') return ownedEntityLookup({ id: 'cust-uuid-1' });
        if (table === 'professionals') return ownedEntityLookup({ id: 'prof-uuid-1' });
        if (table === 'services') return ownedEntityLookup({ id: 'srv-uuid-1', duration_minutes: 60 });
        if (table === 'platform_users') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({ data: { global_role: 'standard' }, error: null })
                }))
              }))
            }))
          };
        }
        if (table === 'appointments') {
          return {
            insert: vi.fn().mockImplementation((records: Record<string, unknown>[]) => {
              if (shouldSimulateGistCollision) {
                // Simulate PostgreSQL GIST exclusion constraint error (SQLSTATE 23P01)
                const error = Object.assign(
                  new Error('conflicting key value violates exclusion constraint "prevent_appointment_overlap"'),
                  { code: '23P01' }
                );
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error })
                  })
                };
              }

              const row = { id: 'appt-uuid-999', ...records[0], status: 'scheduled', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: row, error: null })
                })
              };
            })
          };
        }
        return { select: vi.fn() };
      })
    } as unknown as SupabaseClient;
  });

  it('successfully books an appointment and generates CREATE_APPOINTMENT audit event', async () => {
    const res = await createAppointment(
      mockUserClient,
      mockAdminClient,
      'operator-user-id',
      'studio-aurora',
      {
        customerId: 'cust-uuid-1',
        professionalId: 'prof-uuid-1',
        serviceId: 'srv-uuid-1',
        startAt: '2026-08-10T09:00:00Z',
        notes: 'Prima visita di controllo'
      },
      'corr-appt-001'
    );

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe('appt-uuid-999');
    expect(res.data?.status).toBe('scheduled');
    expect(auditLogsStore).toHaveLength(1);
    expect(auditLogsStore[0]).toEqual(expect.objectContaining({
      organization_id: 'org-aurora-id',
      actor_user_id: 'operator-user-id',
      action: 'CREATE_APPOINTMENT',
      correlation_id: 'corr-appt-001'
    }));
  });

  it('mechanically intercepts PostgreSQL GIST anti-overlap collision and returns clear error without crashing or generating false audit logs', async () => {
    shouldSimulateGistCollision = true;

    const res = await createAppointment(
      mockUserClient,
      mockAdminClient,
      'operator-user-id',
      'studio-aurora',
      {
        customerId: 'cust-uuid-2',
        professionalId: 'prof-uuid-1', // Same professional simultaneously!
        serviceId: 'srv-uuid-1',
        startAt: '2026-08-10T09:30:00Z', // Overlaps 09:00 - 10:00
        notes: 'Tentativo di doppio appuntamento sulla stessa agenda'
      },
      'corr-appt-collision-002'
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('Conflitto di orario');
    // Ensure zero false audit logs were committed on failure
    expect(auditLogsStore).toHaveLength(0);
  });
});
