import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateOrganizationSettings } from '../../src/modules/organizations/organization.service';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Multi-tenant Integration & Isolation Tests (Phase 0 Requirements)', () => {
  let mockAdminClient: SupabaseClient;
  let mockUserClient: SupabaseClient;
  let auditLogsStore: unknown[];
  let orgsStore: Record<string, any>;

  beforeEach(() => {
    auditLogsStore = [];
    orgsStore = {
      'studio-aurora': {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Studio Aurora',
        slug: 'studio-aurora',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        status: 'active',
        settings_json: { display_name: 'Studio Aurora' },
      },
      'studio-brera': {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Studio Brera',
        slug: 'studio-brera',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        status: 'active',
        settings_json: { display_name: 'Studio Brera' },
      },
    };

    mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((records: unknown[]) => {
              auditLogsStore.push(...records);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'mock-audit-id' }, error: null }),
                }),
              };
            }),
          };
        }
      }),
    } as unknown as SupabaseClient;

    mockUserClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((field: string, val: string) => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({ data: orgsStore[val] || null, error: orgsStore[val] ? null : new Error('RLS Error') }),
                })),
              })),
            })),
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation((field: string, idVal: string) => {
                const slug = Object.keys(orgsStore).find(k => orgsStore[k].id === idVal);
                if (slug) {
                  orgsStore[slug].settings_json = updates.settings_json;
                  return Promise.resolve({ error: null });
                }
                return Promise.resolve({ error: new Error('Update failed or RLS blocked') });
              }),
            })),
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((field: string, orgId: string) => ({
                eq: vi.fn().mockImplementation((_, userId: string) => ({
                  eq: vi.fn().mockImplementation(() => ({
                    single: vi.fn().mockImplementation(() => {
                      // Owner A is member ONLY of Studio Aurora
                      if (orgId === '11111111-1111-1111-1111-111111111111' && userId === 'owner-a-id') {
                        return Promise.resolve({ data: { role: 'organization_owner', status: 'active' }, error: null });
                      }
                      // Owner B is member ONLY of Studio Brera
                      if (orgId === '22222222-2222-2222-2222-222222222222' && userId === 'owner-b-id') {
                        return Promise.resolve({ data: { role: 'organization_owner', status: 'active' }, error: null });
                      }
                      return Promise.resolve({ data: null, error: new Error('RLS blocked or not member') });
                    }),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'platform_users') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({ data: { global_role: 'standard' }, error: null }),
                })),
              })),
            })),
          };
        }
      }),
    } as unknown as SupabaseClient;
  });

  it('Owner A can successfully update Studio Aurora settings and generates exactly ONE audit log', async () => {
    const result = await updateOrganizationSettings(
      mockUserClient,
      mockAdminClient,
      'owner-a-id',
      'studio-aurora',
      { displayName: 'Studio Aurora V2', themePreference: 'institutional' },
      'corr-test-001'
    );

    expect(result.success).toBe(true);
    expect(orgsStore['studio-aurora'].settings_json).toEqual({
      display_name: 'Studio Aurora',
      displayName: 'Studio Aurora V2',
      themePreference: 'institutional',
    });

    // Verify audit logs
    expect(auditLogsStore).toHaveLength(1);
    expect(auditLogsStore[0]).toEqual(
      expect.objectContaining({
        organization_id: '11111111-1111-1111-1111-111111111111',
        actor_user_id: 'owner-a-id',
        action: 'UPDATE_ORGANIZATION_SETTINGS',
        correlation_id: 'corr-test-001',
      })
    );
  });

  it('Owner A attempts to modify Studio Brera -> BLOCKED, zero data changes, zero audit logs generated', async () => {
    const originalSettings = { ...orgsStore['studio-brera'].settings_json };

    const result = await updateOrganizationSettings(
      mockUserClient,
      mockAdminClient,
      'owner-a-id',
      'studio-brera', // Trying to attack Org B
      { displayName: 'Malicious Update' },
      'corr-test-attack-002'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Acesso negado');
    // Ensure data remains unchanged
    expect(orgsStore['studio-brera'].settings_json).toEqual(originalSettings);
    // Ensure no partial or corrupt audit log was recorded for denied action
    expect(auditLogsStore).toHaveLength(0);
  });

  it('Owner B attempts to modify Studio Aurora -> BLOCKED', async () => {
    const result = await updateOrganizationSettings(
      mockUserClient,
      mockAdminClient,
      'owner-b-id',
      'studio-aurora', // Trying to access Org A
      { displayName: 'Hacked by B' },
      'corr-test-003'
    );

    expect(result.success).toBe(false);
    expect(auditLogsStore).toHaveLength(0);
  });
});
