-- WAI Phase 0 RLS Validation Test Suite (pgTAP / Pure SQL assertions)
-- Proves complete Tenant Isolation and security boundaries between Studio Aurora (Org A) and Studio Brera (Org B)

BEGIN;

SELECT plan(10);

-- 1. Verify standard users cannot read cross-tenant data (Owner A cannot read Org B)
-- Simulate session as Owner A (00000000-0000-0000-0000-000000000002)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

SELECT results_eq(
  'SELECT slug FROM public.organizations WHERE slug = ''studio-brera''',
  ARRAY[]::text[],
  'Owner A MUST NOT be able to read Organization B (Studio Brera)'
);

SELECT results_eq(
  'SELECT slug FROM public.organizations WHERE slug = ''studio-aurora''',
  ARRAY['studio-aurora']::text[],
  'Owner A MUST be able to read their own Organization (Studio Aurora)'
);

-- 2. Verify cross-tenant updates are blocked (Owner A trying to update Org B)
PREPARE update_org_b AS UPDATE public.organizations SET name = 'Hacked by A' WHERE slug = 'studio-brera';
SELECT results_eq(
  'UPDATE public.organizations SET name = ''Hacked by A'' WHERE slug = ''studio-brera'' RETURNING id',
  ARRAY[]::uuid[],
  'Owner A MUST NOT be able to update Organization B data'
);
DEALLOCATE update_org_b;

-- 3. Verify Owner A can update their own organization settings
SELECT results_eq(
  'UPDATE public.organizations SET settings_json = ''{"display_name": "Studio Aurora Updated"}''::jsonb WHERE slug = ''studio-aurora'' RETURNING slug',
  ARRAY['studio-aurora']::text[],
  'Owner A CAN update their own organization settings'
);

-- 4. Verify standard user cannot create new organizations
SELECT throws_ok(
  'INSERT INTO public.organizations (name, slug) VALUES (''Unauthorized Org'', ''unauth-org'')',
  'new row violates row-level security policy for table "organizations"',
  'Standard users cannot create organizations directly'
);

-- 5. Switch to Owner B (00000000-0000-0000-0000-000000000003) and verify B cannot read A
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SELECT results_eq(
  'SELECT slug FROM public.organizations WHERE slug = ''studio-aurora''',
  ARRAY[]::text[],
  'Owner B MUST NOT be able to read Organization A (Studio Aurora)'
);

-- 6. Verify spoofing organization_id in queries does not bypass RLS for member lists
SELECT results_eq(
  'SELECT role FROM public.organization_members WHERE organization_id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY[]::text[],
  'Spoofed organization_id query MUST NOT reveal member lists of another organization'
);

-- 7. Switch to wai_admin (00000000-0000-0000-0000-000000000001) and verify global access
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.organizations',
  ARRAY[2]::int[],
  'wai_admin CAN read all organizations globally'
);

-- 8. Verify wai_admin can insert organizations
SELECT lives_ok(
  'INSERT INTO public.organizations (id, name, slug) VALUES (''33333333-3333-3333-3333-333333333333'', ''Studio Admin Created'', ''studio-admin'')',
  'wai_admin CAN insert new organizations'
);

-- 9. Verify standard user cannot access administrative profiles in platform_users
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
SELECT results_eq(
  'SELECT global_role FROM public.platform_users WHERE user_id = ''00000000-0000-0000-0000-000000000001''',
  ARRAY[]::text[],
  'Standard user MUST NOT read wai_admin global role profile'
);

-- 10. Finish test suite
SELECT * FROM finish();
ROLLBACK;
