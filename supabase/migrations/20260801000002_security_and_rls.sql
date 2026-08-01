-- WAI Phase 0 Security Functions & Row Level Security (RLS) Policies

-- Function: Check if current authenticated user is a wai_admin
CREATE OR REPLACE FUNCTION public.is_wai_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_users
    WHERE user_id = auth.uid()
      AND global_role = 'wai_admin'
      AND status = 'active'
  );
$$;

-- Function: Check if current authenticated user belongs to a specific organization
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Function: Get current authenticated user's role in a specific organization
CREATE OR REPLACE FUNCTION public.get_org_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = target_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- Function: Verify if user has owner or operator role in organization (prevents client spoofing)
CREATE OR REPLACE FUNCTION public.is_org_owner_or_operator(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('organization_owner', 'organization_operator')
  );
$$;

-- Enable Row Level Security on all application tables
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- POLICIES FOR: platform_users
-- Users can read their own platform profile; wai_admin can read all profiles.
CREATE POLICY "platform_users_select_policy"
  ON public.platform_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_wai_admin());

-- Only wai_admin or service_role can insert/update platform_users directly.
CREATE POLICY "platform_users_admin_write_policy"
  ON public.platform_users
  FOR ALL
  TO authenticated
  USING (public.is_wai_admin())
  WITH CHECK (public.is_wai_admin());


-- POLICIES FOR: organizations
-- 1 & 2: Standard user only reads organizations they belong to. wai_admin can read all.
CREATE POLICY "organizations_select_policy"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(id) OR public.is_wai_admin());

-- 3: Standard users CANNOT insert or delete organizations directly. Only wai_admin can insert/delete.
CREATE POLICY "organizations_insert_delete_policy"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (public.is_wai_admin())
  WITH CHECK (public.is_wai_admin());

-- 5: organization_owner can update ONLY their own organization settings.
CREATE POLICY "organizations_update_policy"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.get_org_role(id) = 'organization_owner' OR public.is_wai_admin())
  WITH CHECK (public.get_org_role(id) = 'organization_owner' OR public.is_wai_admin());


-- POLICIES FOR: organization_members
-- 4: Members read associations of organizations they belong to.
CREATE POLICY "organization_members_select_policy"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id) OR auth.uid() = user_id OR public.is_wai_admin());

-- Only organization_owner or wai_admin can manage members in their organization.
CREATE POLICY "organization_members_modify_policy"
  ON public.organization_members
  FOR ALL
  TO authenticated
  USING ((public.get_org_role(organization_id) = 'organization_owner') OR public.is_wai_admin())
  WITH CHECK ((public.get_org_role(organization_id) = 'organization_owner') OR public.is_wai_admin());


-- POLICIES FOR: audit_logs
-- Members read audit logs of their organization; wai_admin reads all.
CREATE POLICY "audit_logs_select_policy"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.is_wai_admin()
  );

-- Authenticated members can insert audit logs for their organization.
CREATE POLICY "audit_logs_insert_policy"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR public.is_wai_admin()
  );

-- Audit logs are immutable: No updates or deletions allowed to authenticated users.
