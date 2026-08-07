import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCustomer, updateCustomer, normalizePhoneNumber } from '../../src/modules/crm/crm.service';
import { SupabaseClient } from '@supabase/supabase-js';

describe('CRM Service & E.164 Normalization Unit Tests (Fase 1)', () => {
  let mockAdminClient: SupabaseClient;
  let mockUserClient: SupabaseClient;
  let auditLogsStore: unknown[];
  let customersStore: Record<string, any>;

  beforeEach(() => {
    auditLogsStore = [];
    customersStore = {
      'cust-001': {
        id: 'cust-001',
        organization_id: 'org-aurora-id',
        first_name: 'Marco',
        last_name: 'Rossi',
        phone_normalized: '+393331112222',
        email: 'marco.rossi@email.it',
        birth_date: null,
        marketing_consent: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };

    mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((records: unknown[]) => {
              auditLogsStore.push(...records);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'audit-id-123' }, error: null })
                })
              };
            })
          };
        }
      })
    } as unknown as SupabaseClient;

    mockUserClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-aurora-id', name: 'Studio Aurora', slug: 'studio-aurora', status: 'active', locale: 'it-IT', timezone: 'Europe/Rome' },
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
        if (table === 'customers') {
          return {
            insert: vi.fn().mockImplementation((records: any[]) => {
              const record = records[0];
              const id = 'new-cust-id';
              const newRow = { id, ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
              customersStore[id] = newRow;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newRow, error: null })
                })
              };
            }),
            select: vi.fn().mockImplementation(() => {
              const chain: any = {
                eq: vi.fn().mockImplementation(() => chain),
                neq: vi.fn().mockImplementation(() => chain),
                or: vi.fn().mockImplementation(() => chain),
                order: vi.fn().mockImplementation(() => chain),
                single: vi.fn().mockImplementation(() => Promise.resolve({ data: Object.values(customersStore)[0] || null, error: null })),
                then: (fn: any) => fn({ data: Object.values(customersStore), error: null })
              };
              return chain;
            }),
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((_, id: string) => ({
                eq: vi.fn().mockImplementation(() => {
                  if (customersStore[id]) {
                    customersStore[id] = { ...customersStore[id], ...updates };
                    return {
                      select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: customersStore[id], error: null })
                      })
                    };
                  }
                  return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: new Error('NotFound') }) }) };
                })
              }))
            }))
          };
        }
      })
    } as unknown as SupabaseClient;
  });

  it('normalizes Italian phone numbers to strict E.164 pattern on customer creation and emits audit log', async () => {
    const res = await createCustomer(
      mockUserClient,
      mockAdminClient,
      'operator-id',
      'studio-aurora',
      {
        firstName: 'Giulia',
        lastName: 'Bianchi',
        phone: '340 123 4567', // Raw Italian mobile format without international prefix
        marketingConsent: true
      },
      'corr-crm-test-001'
    );

    expect(res.success).toBe(true);
    expect(res.data?.phoneNormalized).toBe('+393401234567');
    expect(res.data?.marketingConsent).toBe(true);

    expect(auditLogsStore).toHaveLength(1);
    expect(auditLogsStore[0]).toEqual(expect.objectContaining({
      organization_id: 'org-aurora-id',
      actor_user_id: 'operator-id',
      action: 'CREATE_CUSTOMER',
      correlation_id: 'corr-crm-test-001',
      after_data: expect.objectContaining({ phone_normalized: '+393401234567' })
    }));
  });

  it('TEST 2: normalizes raw mobile number 3401234567 to +393401234567 without altering digits', () => {
    const res = normalizePhoneNumber('3401234567', '+39');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('+393401234567');
  });

  it('TEST 3: normalizes 00393401234567 to +393401234567', () => {
    const res = normalizePhoneNumber('00393401234567', '+39');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('+393401234567');
  });

  it('TEST 4: normalizes +39 3401234567 with spaces to +393401234567', () => {
    const res = normalizePhoneNumber('+39 3401234567', '+39');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('+393401234567');
  });

  it('TEST 6: rejects invalid phone number 123 returning valid=false and error message', () => {
    const res = normalizePhoneNumber('123', '+39');
    expect(res.valid).toBe(false);
    expect(res.normalized).toBeNull();
    expect(res.reason).toContain('Formato telefono non valido');
  });

  it('updates customer marketing consent status and generates an UPDATE_CUSTOMER audit event with before and after snapshots', async () => {
    const res = await updateCustomer(
      mockUserClient,
      mockAdminClient,
      'operator-id',
      'studio-aurora',
      'cust-001',
      {
        marketingConsent: true,
        notes: 'Cliente ha firmato modulo di consenso privacy in studio.'
      },
      'corr-crm-test-003'
    );

    expect(res.success).toBe(true);
    expect(res.data?.marketingConsent).toBe(true);
    expect(res.data?.notes).toContain('firmato modulo');

    expect(auditLogsStore).toHaveLength(1);
    expect((auditLogsStore[0] as any).before_data.marketing_consent).toBe(false);
    expect((auditLogsStore[0] as any).after_data.marketing_consent).toBe(true);
  });
});
