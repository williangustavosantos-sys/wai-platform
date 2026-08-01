import { describe, it, expect, vi } from 'vitest';
import { isWaiAdmin, verifyOrganizationAccess, getCurrentSession } from '../../src/security/auth';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Security & Authorization Unit Tests', () => {
  it('should return null when user is not authenticated', async () => {
    const mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Unauthenticated') }),
      },
    } as unknown as SupabaseClient;

    const session = await getCurrentSession(mockClient);
    expect(session).toBeNull();
  });

  it('should verify wai_admin role correctly', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { global_role: 'wai_admin' }, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const isAdmin = await isWaiAdmin(mockClient, 'admin-id-123');
    expect(isAdmin).toBe(true);
  });

  it('should deny wai_admin role to standard user', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { global_role: 'standard' }, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const isAdmin = await isWaiAdmin(mockClient, 'user-id-456');
    expect(isAdmin).toBe(false);
  });

  it('should allow Owner A to access Studio Aurora', async () => {
    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-a', name: 'Studio Aurora', slug: 'studio-aurora', timezone: 'Europe/Rome', locale: 'it-IT', settings_json: {} },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { role: 'organization_owner', status: 'active' },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
      }),
    } as unknown as SupabaseClient;

    const access = await verifyOrganizationAccess(mockClient, 'owner-a', 'studio-aurora');
    expect(access).not.toBeNull();
    expect(access?.organizationSlug).toBe('studio-aurora');
    expect(access?.role).toBe('organization_owner');
  });

  it('should deny Owner A access to Studio Brera (Tenant Isolation)', async () => {
    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-b', name: 'Studio Brera', slug: 'studio-brera', timezone: 'Europe/Rome', locale: 'it-IT', settings_json: {} },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found / RLS Blocked') }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'platform_users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { global_role: 'standard' }, error: null }),
                }),
              }),
            }),
          };
        }
      }),
    } as unknown as SupabaseClient;

    const access = await verifyOrganizationAccess(mockClient, 'owner-a', 'studio-brera');
    expect(access).toBeNull();
  });
});
