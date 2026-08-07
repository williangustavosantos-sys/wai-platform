-- WAI Phase 2 Cloud Security: Structural Least Privilege Grants
-- Concede permissões mínimas estruturais para que as políticas de RLS governem o acesso às tabelas operacionais.
-- Sem GRANT ALL para anon ou authenticated.

-- 1. Schema Usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Service Role (acesso administrativo total de backend e scripts da Admin API)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 3. Authenticated Users (acesso estritamente governado pelas políticas de Row Level Security - RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- 4. Anon (nenhum privilégio nas tabelas operacionais privadas do WAI Platform)
-- O role anon possui apenas USAGE no schema public, mantendo as tabelas seguras contra leituras ou escritas não autenticadas.
