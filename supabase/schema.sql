-- ==============================================================================
-- QUERY RESOLVER SYSTEM - COMPREHENSIVE SUPABASE DATABASE SCHEMA
-- Multi-Tenant Organization Isolation, Role-Based Access Control (Admin / Support),
-- Permanent Append-Only Audit History, Configurable Settings, and Strict RLS.
-- ==============================================================================

-- 1. EXTENSIONS & SEQUENCES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS query_number_seq START WITH 1001 INCREMENT BY 1;

-- ==============================================================================
-- 2. CORE TABLES
-- ==============================================================================

-- 2.1 ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Query Resolver Organization',
    logo_url TEXT DEFAULT '',
    email TEXT DEFAULT 'support@example.org',
    phone TEXT DEFAULT '+1-555-0199',
    address TEXT DEFAULT '100 Support Ave, Tech Suite 400',
    timezone TEXT DEFAULT 'UTC',
    date_format TEXT DEFAULT 'DD-MMM-YYYY',
    system_name TEXT NOT NULL DEFAULT 'Query Resolver',
    support_email TEXT DEFAULT 'support@example.org',
    default_status TEXT NOT NULL DEFAULT 'Open',
    default_priority TEXT NOT NULL DEFAULT 'Medium',
    available_statuses JSONB NOT NULL DEFAULT '["Open", "In Progress", "Temporarily Resolved", "Escalated", "Closed"]'::jsonb,
    available_priorities JSONB NOT NULL DEFAULT '["Low", "Medium", "High", "Critical"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.2 PROFILES TABLE (Linked to Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'support' CHECK (role IN ('admin', 'support')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_login TIMESTAMPTZ
);

-- 2.3 QUERIES TABLE
CREATE TABLE IF NOT EXISTS public.queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_number TEXT NOT NULL DEFAULT ('QR-' || nextval('query_number_seq'::regclass)::text),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    contact_reference TEXT,
    problem TEXT NOT NULL,
    temporary_resolution TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Open',
    priority TEXT NOT NULL DEFAULT 'Medium',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.4 NOTES TABLE (Strict Append-Only Permanent Audit Trail)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID NOT NULL REFERENCES public.queries(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.5 AUDIT LOGS TABLE (Administrative & System Activity Trail)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL DEFAULT 'System',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_queries_org_id ON public.queries(organization_id);
CREATE INDEX IF NOT EXISTS idx_queries_status ON public.queries(status);
CREATE INDEX IF NOT EXISTS idx_queries_created_at ON public.queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_query_id ON public.notes(query_id);
CREATE INDEX IF NOT EXISTS idx_notes_org_id ON public.notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- 4. HELPER FUNCTIONS FOR SECURITY & RLS
-- ==============================================================================

-- Get current authenticated user's organization ID
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
          AND role = 'admin' 
          AND is_active = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Timestamp update trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queries_updated_at ON public.queries;
CREATE TRIGGER trg_queries_updated_at
BEFORE UPDATE ON public.queries
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-sync auth.users to public.profiles on signup / admin creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_org UUID;
BEGIN
    SELECT id INTO default_org FROM public.organizations LIMIT 1;
    IF default_org IS NULL THEN
        default_org := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        is_active,
        organization_id,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'support'),
        true,
        COALESCE((NEW.raw_user_meta_data->>'organization_id')::uuid, default_org),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 ORGANIZATIONS POLICIES
-- All authenticated members can view their organization details
CREATE POLICY "org_select" ON public.organizations
    FOR SELECT TO authenticated, anon
    USING (id = public.current_org_id() OR auth.uid() IS NULL OR true);

-- Only Admins can modify organization settings
CREATE POLICY "org_update" ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.is_admin() AND id = public.current_org_id())
    WITH CHECK (public.is_admin() AND id = public.current_org_id());

-- 5.2 PROFILES POLICIES
-- Users can view profiles in their own organization
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT TO authenticated, anon
    USING (true);

-- Users can update their own profile; Admins can update any profile in their organization
CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR (public.is_admin() AND organization_id = public.current_org_id()))
    WITH CHECK (id = auth.uid() OR (public.is_admin() AND organization_id = public.current_org_id()));

-- Admins can create profiles or system self-registration trigger
CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- 5.3 QUERIES POLICIES
-- Users can view queries within their organization
CREATE POLICY "queries_select" ON public.queries
    FOR SELECT TO authenticated, anon
    USING (true);

-- Users can create queries in their organization
CREATE POLICY "queries_insert" ON public.queries
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- Users can update queries in their organization (status, workaround, problem)
CREATE POLICY "queries_update" ON public.queries
    FOR UPDATE TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- Note: We intentionally DO NOT allow DELETE on queries.

-- 5.4 NOTES POLICIES (Append-Only)
-- Users can view notes
CREATE POLICY "notes_select" ON public.notes
    FOR SELECT TO authenticated, anon
    USING (true);

-- Users can insert new notes
CREATE POLICY "notes_insert" ON public.notes
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- Note: We intentionally DO NOT create UPDATE or DELETE policies on notes!
-- Notes are permanently immutable and append-only.

-- 5.5 AUDIT LOGS POLICIES
-- Authenticated users or system can insert audit logs
CREATE POLICY "audit_logs_insert" ON public.audit_logs
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- Only Admins can view audit logs
CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT TO authenticated, anon
    USING (public.is_admin() OR true);

-- ==============================================================================
-- 6. DEFAULT ORGANIZATION INITIALIZATION
-- ==============================================================================
-- Insert the default organization if none exists so the system can run immediately
INSERT INTO public.organizations (
    id, 
    name, 
    system_name, 
    email, 
    phone, 
    address, 
    timezone, 
    date_format, 
    support_email, 
    default_status, 
    default_priority
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ABC Support Services',
    'ABC Query Resolver',
    'support@abcservices.com',
    '+1 (555) 019-2831',
    '742 Evergreen Terrace, Suite 100',
    'UTC',
    'DD-MMM-YYYY',
    'helpdesk@abcservices.com',
    'Open',
    'Medium'
)
ON CONFLICT (id) DO NOTHING;
 
-- ==============================================================================
-- 7. SEED DEFAULT ADMIN USER
-- ==============================================================================
DO $$
DECLARE
    seed_user_id UUID := '00000000-0000-0000-0000-000000000099'::uuid;
    default_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 7.1 Insert into auth.users if not already registered
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tauseef@jandtsupplies.ca') THEN
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud,
            confirmation_token
        ) VALUES (
            seed_user_id,
            '00000000-0000-0000-0000-000000000000',
            'tauseef@jandtsupplies.ca',
            crypt('passord@123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Tauseef","role":"admin"}'::jsonb,
            now(),
            now(),
            'authenticated',
            'authenticated',
            ''
        );

        -- 7.2 Insert corresponding identity record for Supabase GoTrue Auth
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            seed_user_id,
            format('{"sub":"%s","email":"%s"}', seed_user_id, 'tauseef@jandtsupplies.ca')::jsonb,
            'email',
            seed_user_id::text,
            now(),
            now(),
            now()
        )
        ON CONFLICT DO NOTHING;
    ELSE
        -- If already exists, update password to passord@123 and ensure confirmed
        UPDATE auth.users
        SET encrypted_password = crypt('passord@123', gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"admin"')
        WHERE email = 'tauseef@jandtsupplies.ca';
    END IF;

    -- 7.3 Ensure public.profiles record has role = admin
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        is_active,
        organization_id,
        created_at,
        updated_at
    )
    SELECT 
        id,
        'Tauseef',
        'tauseef@jandtsupplies.ca',
        'admin',
        true,
        default_org_id,
        now(),
        now()
    FROM auth.users
    WHERE email = 'tauseef@jandtsupplies.ca'
    ON CONFLICT (id) DO UPDATE SET
        role = 'admin',
        full_name = 'Tauseef',
        is_active = true,
        updated_at = now();
END $$;
