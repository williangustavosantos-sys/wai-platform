-- WAI Phase 0 & Phase 1 Deterministic Local Seed Data
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

-- 5. Phase 1: Digital Employee Configurations
INSERT INTO public.digital_employees (id, organization_id, name, personality_summary, language, communication_tone, avatar_placeholder_url)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Chiara', 'Assistente cordiale, empática ma altamente precisa per lo Studio Aurora.', 'it-IT', 'cordial_empathic', '/avatars/chiara.svg'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Marco', 'Assistente formale e rigoroso per consulenze legali presso Studio Brera.', 'it-IT', 'formal', '/avatars/marco.svg')
ON CONFLICT (id) DO NOTHING;

-- 6. Phase 1: Professionals
INSERT INTO public.professionals (id, organization_id, name, title, email, phone)
VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Dott. Marco Rossi', 'Titolare / Commercialista', 'rossi@aurora.local', '+39021234567'),
  ('b2222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Dott.ssa Sofia Bianchi', 'Esperta Contabile', 'bianchi@aurora.local', '+39021234568'),
  ('b3333333-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Avv. Lorenzo Conti', 'Socio Fondatore', 'l.conti@brera.local', '+39028899001')
ON CONFLICT (id) DO NOTHING;

-- 7. Phase 1: Services
INSERT INTO public.services (id, organization_id, name, description, duration_minutes, price_cents, buffer_after_minutes)
VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Consulenza Fiscale Iniziale', 'Analisi preventiva per apertura Partita IVA o verifica assetto societario.', 45, 12000, 15),
  ('c2222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Revisione Bilancio Annuale', 'Incontro tecnico di verifica contabile e chiusura esercizio.', 60, 18000, 15),
  ('c3333333-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Parere Legale e Contrattualistica', 'Consulenza specialistica su contratti societari e operazioni M&A.', 60, 25000, 30)
ON CONFLICT (id) DO NOTHING;

-- 8. Phase 1: Professional <-> Services Links
INSERT INTO public.professional_services (organization_id, professional_id, service_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c2222222-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222', 'b3333333-2222-2222-2222-222222222222', 'c3333333-2222-2222-2222-222222222222')
ON CONFLICT (professional_id, service_id) DO NOTHING;

-- 9. Phase 1: Availability Rules (Mon-Fri, 9am to 6pm)
INSERT INTO public.availability_rules (organization_id, professional_id, day_of_week, start_time, end_time, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 1, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 2, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 3, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 4, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 5, '09:00', '17:00', true),
  ('22222222-2222-2222-2222-222222222222', 'b3333333-2222-2222-2222-222222222222', 1, '10:00', '19:00', true),
  ('22222222-2222-2222-2222-222222222222', 'b3333333-2222-2222-2222-222222222222', 3, '10:00', '19:00', true)
ON CONFLICT DO NOTHING;

-- 10. Phase 1: Customers (CRM)
INSERT INTO public.customers (id, organization_id, first_name, last_name, phone_normalized, email, birth_date, marketing_consent, notes)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Giovanni', 'Verdi', '+393401122333', 'giovanni.verdi@example.it', '1985-04-12', true, 'Cliente storico del settore commercio al dettaglio.'),
  ('d2222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Elena', 'Romano', '+393409988777', 'elena.romano@example.it', '1990-09-23', false, 'Richiesta consulenza sul regime forfettario.'),
  ('d3333333-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Alessandro', 'Ferrari', '+393334455666', 'a.ferrari@example.it', '1978-11-03', true, 'Amministratore Delegato di TechCorp Srl.')
ON CONFLICT (organization_id, phone_normalized) DO NOTHING;

-- 11. Phase 1: Business Rules
INSERT INTO public.business_rules (id, organization_id, cancellation_policy, standard_messages, response_rules)
VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{"min_hours_notice": 24, "fee_percent": 0, "refund_policy": "standard"}'::jsonb, '{"confirmation": "Gentile cliente di Studio Aurora, il suo appuntamento è confermato.", "cancellation": "Il suo appuntamento è stato cancellato.", "reminder": "Promemoria appuntamento domani presso Studio Aurora."}'::jsonb, '{"auto_confirm_appointments": true, "max_advance_booking_days": 60, "min_advance_booking_hours": 2}'::jsonb),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{"min_hours_notice": 48, "fee_percent": 0, "refund_policy": "strict"}'::jsonb, '{"confirmation": "Studio Brera: confermiamo la sua prenotazione per la consulenza legale.", "cancellation": "La prenotazione presso Studio Brera è stata annullata.", "reminder": "Promemoria del suo colloquio domani presso Studio Brera."}'::jsonb, '{"auto_confirm_appointments": false, "max_advance_booking_days": 30, "min_advance_booking_hours": 24}'::jsonb)
ON CONFLICT (organization_id) DO NOTHING;
