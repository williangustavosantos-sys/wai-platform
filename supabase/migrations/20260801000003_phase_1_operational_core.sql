-- WAI Phase 1 Operational Core Migration
-- Modules: Assistant Configuration, Basic CRM, WAI Calendar (with GIST anti-overlap), and Business Rules Engine.
-- Strict Multi-Tenant Isolation with Row Level Security (RLS).

-- Enable btree_gist extension for temporal range exclusion constraints (Section 10.3 of WAI Architecture)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- MÓDULO 1: ASSISTANT CONFIGURATION
-- -----------------------------------------------------------------------------
CREATE TABLE public.digital_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  personality_summary TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'it-IT',
  communication_tone TEXT NOT NULL DEFAULT 'cordial_empathic' CHECK (communication_tone IN ('formal', 'cordial_empathic', 'direct')),
  avatar_placeholder_url TEXT NOT NULL DEFAULT '/avatars/default.svg',
  is_default BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_digital_employees_org ON public.digital_employees(organization_id);
CREATE TRIGGER update_digital_employees_updated_at
  BEFORE UPDATE ON public.digital_employees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- MÓDULO 2: CRM BÁSICO (CLIENTES)
-- -----------------------------------------------------------------------------
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL, -- normalized E.164 phone number (e.g., +393401234567)
  email TEXT,
  birth_date DATE,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, -- basic operational history and notes
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customer_org_phone UNIQUE (organization_id, phone_normalized)
);

CREATE INDEX idx_customers_org ON public.customers(organization_id);
CREATE INDEX idx_customers_phone ON public.customers(organization_id, phone_normalized);
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- MÓDULO 3: AGENDA PRÓPRIA WAI (PROFESSIONALS, SERVICES, APPOINTMENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_professionals_org ON public.professionals(organization_id);
CREATE TRIGGER update_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_org ON public.services(organization_id);
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.professional_services (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

CREATE INDEX idx_professional_services_org ON public.professional_services(organization_id);

CREATE TABLE public.availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday... 6=Saturday
  start_time TIME NOT NULL DEFAULT '09:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_availability_rules_org ON public.availability_rules(organization_id, professional_id);
CREATE TRIGGER update_availability_rules_updated_at
  BEFORE UPDATE ON public.availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Appointments table with exclusion constraint against temporal overlaps
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('held', 'confirmed', 'cancelled', 'completed', 'no_show', 'expired')),
  notes TEXT,
  created_by_actor_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_actor_type IN ('user', 'customer', 'system', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_appointment_dates CHECK (end_at > start_at),
  -- Mechanical DB-level anti-overlap prevention (Section 10.3)
  CONSTRAINT prevent_appointment_overlap EXCLUDE USING gist (
    organization_id WITH =,
    professional_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('held', 'confirmed'))
);

CREATE INDEX idx_appointments_org ON public.appointments(organization_id);
CREATE INDEX idx_appointments_professional_time ON public.appointments(organization_id, professional_id, start_at);
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Immutable history log for appointment state changes
CREATE TABLE public.appointment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointment_events_org ON public.appointment_events(organization_id, appointment_id);

-- -----------------------------------------------------------------------------
-- MÓDULO 4: BUSINESS RULES ENGINE & CLOSURES
-- -----------------------------------------------------------------------------
CREATE TABLE public.business_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  cancellation_policy JSONB NOT NULL DEFAULT '{"min_hours_notice": 24, "fee_percent": 0, "refund_policy": "standard"}'::jsonb,
  standard_messages JSONB NOT NULL DEFAULT '{"confirmation": "Gentile cliente, il suo appuntamento è stato confermato.", "cancellation": "Il suo appuntamento è stato cancellato con successo.", "reminder": "Promemoria: ha un appuntamento imminente presso il nostro studio."}'::jsonb,
  response_rules JSONB NOT NULL DEFAULT '{"auto_confirm_appointments": true, "max_advance_booking_days": 60, "min_advance_booking_hours": 2}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_rules_org ON public.business_rules(organization_id);
CREATE TRIGGER update_business_rules_updated_at
  BEFORE UPDATE ON public.business_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE, -- NULL means entire organization is closed
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  closure_type TEXT NOT NULL DEFAULT 'holiday' CHECK (closure_type IN ('holiday', 'vacation', 'blocked_slot')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_closure_dates CHECK (end_at > start_at)
);

CREATE INDEX idx_closures_org_time ON public.closures(organization_id, start_at);
CREATE TRIGGER update_closures_updated_at
  BEFORE UPDATE ON public.closures
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ALL PHASE 1 TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.digital_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closures ENABLE ROW LEVEL SECURITY;

-- Macro macro policy structure:
-- SELECT: Active member of organization or wai_admin
-- INSERT/UPDATE/DELETE: Owner/operator of organization or wai_admin (except immutable tables)

-- 1. digital_employees
CREATE POLICY "digital_employees_select" ON public.digital_employees
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "digital_employees_modify" ON public.digital_employees
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 2. customers
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "customers_modify" ON public.customers
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 3. professionals
CREATE POLICY "professionals_select" ON public.professionals
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "professionals_modify" ON public.professionals
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 4. services
CREATE POLICY "services_select" ON public.services
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "services_modify" ON public.services
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 5. professional_services
CREATE POLICY "professional_services_select" ON public.professional_services
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "professional_services_modify" ON public.professional_services
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 6. availability_rules
CREATE POLICY "availability_rules_select" ON public.availability_rules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "availability_rules_modify" ON public.availability_rules
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 7. appointments
CREATE POLICY "appointments_select" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "appointments_modify" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 8. appointment_events (Immutable: no UPDATE or DELETE allowed)
CREATE POLICY "appointment_events_select" ON public.appointment_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "appointment_events_insert" ON public.appointment_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 9. business_rules
CREATE POLICY "business_rules_select" ON public.business_rules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "business_rules_modify" ON public.business_rules
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

-- 10. closures
CREATE POLICY "closures_select" ON public.closures
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "closures_modify" ON public.closures
  FOR ALL TO authenticated
  USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin())
  WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());
