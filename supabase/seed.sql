-- WAI Seed Data (Sem GRANTs estruturais e sem injeção direta em auth.users)
-- AVISO: Em ambientes Supabase Cloud, a inicialização deste conjunto deve ocorrer via script
-- utilizando a Admin API do Auth (scripts/seed-cloud.ts), respeitando os IDs dinâmicos gerados.

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
  ('11111111-1111-1111-1111-111111111111', 'Studio Aurora', 'studio-aurora', 'Europe/Rome', 'it-IT', 'active', '{"display_name": "Studio Aurora", "theme_preference": "institutional", "address": "Via dei Mille 10, Milano (MI)", "phone": "+39021234567", "whatsapp": "+393401122333", "working_hours": "Lun-Ven 09:00 - 18:00 (Ven 09:00 - 17:00)"}'::jsonb),
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
  -- WILLIAN: profissional criado em runtime no projeto principal (studio-aurora);
  -- mantido no seed para que as availability_rules abaixo respeitem a FK.
  ('ec68107c-cb48-46eb-8bc4-5267349e691f', '11111111-1111-1111-1111-111111111111', 'WILLIAN', 'dr', NULL, NULL),
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
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 1, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 2, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 3, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 4, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'b2222222-1111-1111-1111-111111111111', 5, '09:00', '17:00', true),
  ('22222222-2222-2222-2222-222222222222', 'b3333333-2222-2222-2222-222222222222', 1, '10:00', '19:00', true),
  ('22222222-2222-2222-2222-222222222222', 'b3333333-2222-2222-2222-222222222222', 3, '10:00', '19:00', true),
  -- WILLIAN: regras espelhadas das demais (Seg-Qui 09:00-18:00, Sex 09:00-17:00).
  ('11111111-1111-1111-1111-111111111111', 'ec68107c-cb48-46eb-8bc4-5267349e691f', 1, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'ec68107c-cb48-46eb-8bc4-5267349e691f', 2, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'ec68107c-cb48-46eb-8bc4-5267349e691f', 3, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'ec68107c-cb48-46eb-8bc4-5267349e691f', 4, '09:00', '18:00', true),
  ('11111111-1111-1111-1111-111111111111', 'ec68107c-cb48-46eb-8bc4-5267349e691f', 5, '09:00', '17:00', true)
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

-- 12. Phase 2: Sample Conversations & Messages
INSERT INTO public.conversations (id, organization_id, customer_id, channel, status)
VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'webchat', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (id, organization_id, conversation_id, role, content, metadata)
VALUES
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'customer', 'Ciao, vorrei informazioni sulle disponibilità.', '{"intent": "CHECK_AVAILABILITY"}'::jsonb),
  ('a2222222-2222-4222-8222-222222222222', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'assistant', 'Ciao Giovanni! Sono Sofia dello Studio Aurora. Ti aiuto volentieri a trovare il momento migliore.', '{"intent": "CHECK_AVAILABILITY", "toolsCalled": ["findCustomer", "checkAvailability"]}'::jsonb)
ON CONFLICT DO NOTHING;

-- 13. Phase 1 Test Appointments: Occupied Slots & Conflicts
INSERT INTO public.appointments (id, organization_id, customer_id, professional_id, service_id, start_at, end_at, status, created_by_actor_type, notes)
VALUES
  -- Dott. Marco Rossi on Monday, Aug 10, 2026: 09:00 - 09:45 (Consulenza Fiscale Iniziale)
  ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', '2026-08-10T09:00:00+02:00', '2026-08-10T09:45:00+02:00', 'confirmed', 'user', 'Consulenza di test per verificare orario occupato'),
  -- Dott. Marco Rossi on Monday, Aug 10, 2026: 10:00 - 11:00 (Revisione Bilancio Annuale)
  ('f2222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd2222222-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c2222222-1111-1111-1111-111111111111', '2026-08-10T10:00:00+02:00', '2026-08-10T11:00:00+02:00', 'confirmed', 'user', 'Revisione contabile di test'),
  -- Dott. Marco Rossi on Tuesday, Aug 11, 2026: 14:00 - 14:45 (Consulenza Fiscale Iniziale) - to verify overlap / buffer conflicts
  ('f3333333-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', '2026-08-11T14:00:00+02:00', '2026-08-11T14:45:00+02:00', 'confirmed', 'user', 'Appuntamento per verificare i buffer di conflitto')
ON CONFLICT (id) DO NOTHING;
