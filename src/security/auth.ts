import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@/logging/logger';

export interface UserSession {
  userId: string;
  email: string;
}

export interface OrganizationAccess {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: 'organization_owner' | 'organization_operator' | 'organization_viewer';
  timezone: string;
  locale: string;
  settingsJson: Record<string, unknown>;
}

function resolveOrganizationName(name: unknown, settingsJson: unknown): string {
  const canonicalName = typeof name === 'string' ? name.trim() : '';
  if (canonicalName) return canonicalName;

  const settings = settingsJson && typeof settingsJson === 'object'
    ? settingsJson as Record<string, unknown>
    : {};
  const legacyDisplayName = typeof settings.displayName === 'string'
    ? settings.displayName.trim()
    : '';

  return legacyDisplayName || 'Organizzazione';
}

/**
 * Validates active session on the server. Never trusts client-side token representations.
 */
export async function getCurrentSession(client: SupabaseClient): Promise<UserSession | null> {
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email || '',
    };
  } catch {
    return null;
  }
}

/**
 * Verifies if the user is a global platform administrator (wai_admin).
 */
export async function isWaiAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('platform_users')
    .select('global_role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return false;
  }

  return data.global_role === 'wai_admin';
}

/**
 * Resolves organization access strictly against database membership records.
 * Prevents horizontal privilege escalation where client manipulates URL or headers.
 */
export async function verifyOrganizationAccess(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  logger?: Logger
): Promise<OrganizationAccess | null> {
  const log = logger || new Logger();

  // 1. Fetch organization by slug under current client RLS
  const { data: org, error: orgError } = await client
    .from('organizations')
    .select('id, name, slug, timezone, locale, status, settings_json')
    .eq('slug', organizationSlug)
    .eq('status', 'active')
    .single();

  if (orgError || !org) {
    log.warn('Organization resolution failed or not accessible via RLS', { organizationSlug, userId });
    return null;
  }

  // 2. Explicitly check organization_members table for role and active membership
  const { data: member, error: memberError } = await client
    .from('organization_members')
    .select('role, status')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (memberError || !member) {
    // Also allow if user is global wai_admin accessing via admin portal/server logic
    const admin = await isWaiAdmin(client, userId);
    if (admin) {
      return {
        organizationId: org.id,
        organizationName: resolveOrganizationName(org.name, org.settings_json),
        organizationSlug: org.slug,
        role: 'organization_owner', // Admin assumes operational oversight
        timezone: org.timezone,
        locale: org.locale,
        settingsJson: org.settings_json as Record<string, unknown>,
      };
    }
    log.warn('Access denied: User is not an active member of requested organization', { organizationId: org.id, userId });
    return null;
  }

  return {
    organizationId: org.id,
    organizationName: resolveOrganizationName(org.name, org.settings_json),
    organizationSlug: org.slug,
    role: member.role as OrganizationAccess['role'],
    timezone: org.timezone,
    locale: org.locale,
    settingsJson: org.settings_json as Record<string, unknown>,
  };
}
