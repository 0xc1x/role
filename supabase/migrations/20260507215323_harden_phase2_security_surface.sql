begin;

-- Fudi does not use Supabase GraphQL. Remove the exposed GraphQL surface entirely.
drop extension if exists pg_graphql;

-- Revoke execution on existing public-schema functions from public-facing roles.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Prevent future public auto-grants on functions created in public schema.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;