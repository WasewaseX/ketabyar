-- The pieces of a Supabase project that the migrations depend on, so they can be applied to a
-- plain local Postgres for testing. auth.uid() reads the same claim Supabase's own version does.
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;
grant usage on schema auth to anon, authenticated;
