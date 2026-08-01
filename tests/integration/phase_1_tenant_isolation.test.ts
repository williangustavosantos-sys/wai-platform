import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateAssistantConfig } from '../../src/modules/assistant/assistant.service';
import { createCustomer } from '../../src/modules/crm/crm.service';
import { createAppointment } from '../../src/modules/calendar/calendar.service';
import { updateBusinessRulesConfig } from '../../src/modules/rules/rules.service';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Phase 1 Multi-Tenant Operational Isolation Tests (RLS Barrier & Audit Compliance)', () => {
  let mockAdminClient: SupabaseClient;
  let mockUserClient: SupabaseClient;
  let auditLogsStore: unknown[];
  let assistantConfigsStore: Record<string, any>;

  beforeEach(() => {
    auditLogsStore = [];
    assistantConfigsStore = {
      'org-brera-id': {
        id: 'cfg-brera-123',
        organization_id: 'org-brera-id',
        name: 'Sofia (Brera)',
        personality_prompt: 'Gentile e formale',
        language: 'it',
        communication_tone: 'formale',
        avatar_placeholder: 'S',
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
                  single: vi.fn().mockResolvedValue({ data: { id: 'mock-audit-uuid' }, error: null })
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
              eq: vi.fn().mockImplementation((field: string, slugVal: string) => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockImplementation(() => {
                    if (slugVal === 'studio-brera') {
                      return Promise.resolve({ data: { id: 'org-brera-id', name: 'Studio Brera', slug: 'studio-brera', status: 'active' }, error: null });
                    }
                    if (slugVal === 'studio-aurora') {
                      return Promise.resolve({ data: { id: 'org-aurora-id', name: 'Studio Aurora', slug: 'studio-aurora', status: 'active' }, error: null });
                    }
                    return Promise.resolve({ data: null, error: new Error('NotFound') });
                  })
                }))
              }))
            }))
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((field: string, orgId: string) => ({
                eq: vi.fn().mockImplementation((_, userId: string) => ({
                  eq: vi.fn().mockImplementation(() => ({
                    single: vi.fn().mockImplementation(() => {
                      // Owner A belongs strictly to Studio Aurora (org-aurora-id)
                      if (orgId === 'org-aurora-id' && userId === 'owner-aurora-uuid') {
                        return Promise.resolve({ data: { role: 'organization_owner', status: 'active' }, error: null });
                      }
                      // RLS blocks access when Owner A tries to touch Org B (Brera)
                      return Promise.resolve({ data: null, error: new Error('RLS block: unauthorized tenant member') });
                    })
                  }))
                }))
              }))
            }))
          };
        }
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
        return { select: vi.fn() };
      })
    } as unknown as SupabaseClient;
  });

  it('Module 1: Owner Aurora cannot update Assistant Configuration of Studio Brera (Zero Audit Emitted)', async () => {
    const origConfig = { ...assistantConfigsStore['org-brera-id'] };

    const res = await updateAssistantConfig(
      mockUserClient,
      mockAdminClient,
      'owner-aurora-uuid',
      'studio-brera', // Cross-tenant unauthorized operation
      { name: 'Hacked Assistant', communicationTone: 'formal' },
      'corr-attack-mod1-001'
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe('Accesso negato o organizzazione non trovata.');
    expect(assistantConfigsStore['org-brera-id']).toEqual(origConfig); // State intact
    expect(auditLogsStore).toHaveLength(0); // No fraudulent audit entries
  });

  it('Module 2: Owner Aurora cannot inject CRM customers into Studio Brera', async () => {
    const res = await createCustomer(
      mockUserClient,
      mockAdminClient,
      'owner-aurora-uuid',
      'studio-brera',
      { firstName: 'Malicious', lastName: 'Intruder', phone: '3331112233', marketingConsent: false },
      'corr-attack-mod2-001'
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe('Accesso negato al tenant specificato.');
    expect(auditLogsStore).toHaveLength(0);
  });

  it('Module 3: Owner Aurora cannot create appointments inside Studio Brera calendar', async () => {
    const res = await createAppointment(
      mockUserClient,
      mockAdminClient,
      'owner-aurora-uuid',
      'studio-brera',
      { customerId: 'c-1', professionalId: 'p-1', serviceId: 's-1', startAt: '2026-08-10T10:00:00Z' },
      'corr-attack-mod3-001'
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe('Permessi insufficienti per agendare appuntamenti.');
    expect(auditLogsStore).toHaveLength(0);
  });

  it('Module 4: Owner Aurora cannot alter Business Rules & Cancellation policies of Studio Brera', async () => {
    const res = await updateBusinessRulesConfig(
      mockUserClient,
      mockAdminClient,
      'owner-aurora-uuid',
      'studio-brera',
      { cancellationWindowHours: 0, welcomeMessage: 'Spam welcome message' },
      'corr-attack-mod4-001'
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe('Permessi insufficienti.');
    expect(auditLogsStore).toHaveLength(0);
  });
});
