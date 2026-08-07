-- ==============================================================================
-- MIGRATION: 20260801000004_phase_2_conversation_engine.sql
-- FASE 2: Sistema de Conversas & Persistência de Mensagens WAI
-- Garantia de estrito isolamento multi-tenant (RLS) e suporte a conectores
-- ==============================================================================

-- 1. TABELA DE CONVERSAS (conversations)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'webchat' CHECK (channel IN ('webchat', 'whatsapp', 'instagram', 'sms')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting_customer', 'human_handoff', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON public.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members read access on conversations in their organization"
    ON public.conversations FOR SELECT
    USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow operators insert on conversations in their organization"
    ON public.conversations FOR INSERT
    WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow operators update on conversations in their organization"
    ON public.conversations FOR UPDATE
    USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow owners delete on conversations in their organization"
    ON public.conversations FOR DELETE
    USING (public.get_org_role(organization_id) = 'organization_owner' OR public.is_wai_admin());

CREATE TRIGGER trg_update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 2. TABELA DE MENSAGENS (messages)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_org_id ON public.messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members read access on messages in their organization"
    ON public.messages FOR SELECT
    USING (public.is_org_member(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow operators insert on messages in their organization"
    ON public.messages FOR INSERT
    WITH CHECK (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow operators update on messages in their organization"
    ON public.messages FOR UPDATE
    USING (public.is_org_owner_or_operator(organization_id) OR public.is_wai_admin());

CREATE POLICY "Allow owners delete on messages in their organization"
    ON public.messages FOR DELETE
    USING (public.get_org_role(organization_id) = 'organization_owner' OR public.is_wai_admin());
