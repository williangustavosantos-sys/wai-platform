-- WAI Phase 0 Deterministic Local Seed Data
-- This bootstrap dataset creates fictitious accounts and organizations exclusively for local testing.
-- No real production credentials or customer data are included.

-- Deterministic UUIDs:
-- Admin User:   00000000-0000-0000-0000-000000000001 (admin@wai.local)
-- Owner A User: 00000000-0000-0000-0000-000000000002 (owner-a@wai.local)
-- Owner B User: 00000000-0000-0000-0000-000000000003 (owner-b@wai.local)
-- Org A:        11111111-1111-1111-1111-111111111111 (Studio Aurora)
-- Org B:        22222222-2222-2222-2222-222222222222 (Studio Brera)

-- 1. Insert simulated users into auth.users (for Supabase Local Auth test capability)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@wai.local', crypt('WaiLocal2026!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'owner-a@wai.local', crypt('WaiLocal2026!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'owner-b@wai.local', crypt('WaiLocal2026!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- 2. Populate platform_users
INSERT INTO public.platform_users (user_id, global_role, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'wai_admin', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'standard', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'standard', 'active')
ON CONFLICT (user_id) DO UPDATE SET global_role = EXCLUDED.global_role, status = EXCLUDED.status;

-- 3. Populate organizations
INSERT INTO public.organizations (id, name, slug, timezone, locale, status, settings_json)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Studio Aurora', 'studio-aurora', 'Europe/Rome', 'it-IT', 'active', '{"display_name": "Studio Aurora", "theme_preference": "institutional"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'Studio Brera', 'studio-brera', 'Europe/Rome', 'it-IT', 'active', '{"display_name": "Studio Brera", "theme_preference": "balanced"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, settings_json = EXCLUDED.settings_json;

-- 4. Populate organization_members
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'organization_owner', 'active'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000003', 'organization_owner', 'active')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
