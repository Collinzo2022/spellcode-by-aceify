-- SpellCode by Aceify: certificate issuance records.
-- Run in Supabase SQL Editor after the existing SpellCode migrations.

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  certificate_number text not null unique,
  storage_key text not null,
  download_url text not null,
  issued_at timestamptz not null default now()
);

alter table public.certificates enable row level security;
create policy certificates_read_own on public.certificates for select using (auth.uid() = user_id or public.is_admin());

-- Certificate issuance writes are server-side only after Full Access and completion verification.
