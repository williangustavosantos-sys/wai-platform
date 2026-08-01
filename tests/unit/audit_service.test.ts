import { describe, it, expect, vi } from 'vitest';
import { recordAuditLog } from '../../src/modules/audit/audit.service';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Audit Service Unit Tests', () => {
  it('should successfully record an audit log with correlationId and before/after states', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'audit-log-uuid-001' }, error: null }),
      }),
    });

    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return { insert: mockInsert };
        }
      }),
    } as unknown as SupabaseClient;

    const logId = await recordAuditLog(
      {
        organizationId: '11111111-1111-1111-1111-111111111111',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        actorType: 'user',
        action: 'UPDATE_ORGANIZATION_SETTINGS',
        entityType: 'organization',
        entityId: '11111111-1111-1111-1111-111111111111',
        beforeData: { display_name: 'Old Name' },
        afterData: { display_name: 'New Name' },
        correlationId: 'req-corr-uuid-888',
      },
      mockClient
    );

    expect(logId).toBe('audit-log-uuid-001');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        organization_id: '11111111-1111-1111-1111-111111111111',
        actor_user_id: '00000000-0000-0000-0000-000000000002',
        action: 'UPDATE_ORGANIZATION_SETTINGS',
        correlation_id: 'req-corr-uuid-888',
        before_data: { display_name: 'Old Name' },
        after_data: { display_name: 'New Name' },
      }),
    ]);
  });

  it('should explicitly throw an error if correlationId is missing', async () => {
    const mockClient = {} as SupabaseClient;

    await expect(
      recordAuditLog(
        {
          organizationId: 'org-id',
          actorUserId: 'user-id',
          action: 'TEST_ACTION',
          entityType: 'org',
          entityId: 'org-id',
          correlationId: '', // Empty correlation ID
        },
        mockClient
      )
    ).rejects.toThrow('CRITICAL: Audit log cannot be recorded without an explicit correlationId.');
  });

  it('should explicitly throw an error when database insertion fails (never silence audit errors)', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Connection / RLS Error') }),
      }),
    });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as unknown as SupabaseClient;

    await expect(
      recordAuditLog(
        {
          organizationId: 'org-id',
          actorUserId: 'user-id',
          action: 'UPDATE_SETTING',
          entityType: 'org',
          entityId: 'org-id',
          correlationId: 'corr-id-999',
        },
        mockClient
      )
    ).rejects.toThrow(/AUDIT FAILURE/);
  });
});
