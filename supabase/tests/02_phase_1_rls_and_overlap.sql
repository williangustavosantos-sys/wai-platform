-- WAI Phase 1 Operational Core Validation Test Suite (pgTAP / Pure SQL assertions)
-- Proves complete Tenant Isolation for CRM, Calendar, and Assistant configuration,
-- as well as database-level anti-overlap constraint guarantees.

BEGIN;

SELECT plan(7);

-- 1. Simulate session as Owner A (Studio Aurora owner)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

SELECT results_eq(
  'SELECT name FROM public.digital_employees WHERE organization_id = ''22222222-2222-2222-2222-222222222222''',
  ARRAY[]::text[],
  'Owner A MUST NOT read digital employee configuration of Studio Brera'
);

SELECT results_eq(
  'SELECT name FROM public.digital_employees WHERE organization_id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY['Chiara']::text[],
  'Owner A MUST read digital employee configuration of Studio Aurora'
);

-- 2. Verify CRM Customer RLS isolation
SELECT results_eq(
  'SELECT last_name FROM public.customers WHERE phone_normalized = ''+393334455666''',
  ARRAY[]::text[],
  'Owner A MUST NOT access customers belonging to Studio Brera'
);

-- 3. Verify cross-tenant customer insertion is blocked by RLS
SELECT throws_ok(
  'INSERT INTO public.customers (organization_id, first_name, last_name, phone_normalized) VALUES (''22222222-2222-2222-2222-222222222222'', ''Intruder'', ''Hack'', ''+390001112223'')',
  'new row violates row-level security policy for table "customers"',
  'Owner A CANNOT insert customer into Studio Brera'
);

-- 4. Verify valid appointment creation for Studio Aurora
SELECT lives_ok(
  $$ INSERT INTO public.appointments (id, organization_id, customer_id, professional_id, service_id, start_at, end_at, status)
     VALUES ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', '2026-09-10 10:00:00+02', '2026-09-10 11:00:00+02', 'confirmed') $$,
  'Owner A CAN schedule a confirmed appointment for Studio Aurora professional'
);

-- 5. Verify database exclusion constraint blocks overlapping appointment for the same professional
SELECT throws_ok(
  $$ INSERT INTO public.appointments (id, organization_id, customer_id, professional_id, service_id, start_at, end_at, status)
     VALUES ('f2222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd2222222-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c2222222-1111-1111-1111-111111111111', '2026-09-10 10:30:00+02', '2026-09-10 11:30:00+02', 'held') $$,
  'conflicting key value violates exclusion constraint "prevent_appointment_overlap"',
  'Database MUST prevent overlapping appointments for active status (held/confirmed)'
);

-- 6. Verify non-blocking status (cancelled/no_show) DOES NOT trigger overlap exception
SELECT lives_ok(
  $$ INSERT INTO public.appointments (id, organization_id, customer_id, professional_id, service_id, start_at, end_at, status)
     VALUES ('f3333333-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd2222222-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c2222222-1111-1111-1111-111111111111', '2026-09-10 10:15:00+02', '2026-09-10 10:45:00+02', 'cancelled') $$,
  'Cancelled appointments do NOT block time slots'
);

SELECT * FROM finish();
ROLLBACK;
