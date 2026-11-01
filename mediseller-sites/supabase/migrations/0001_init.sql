-- MediSeller sites — lead pipeline schema (Phase 1)
-- Run in Supabase: SQL editor → paste → Run.   (or `supabase db push`)
-- All access goes through Cloudflare Functions with the service-role key; the browser never talks to Supabase directly.

create extension if not exists pgcrypto;

create table if not exists public.sites (
  id          text primary key,             -- matches site.config.mjs `id`
  name        text not null,
  domain      text not null,
  created_at  timestamptz not null default now()
);
insert into public.sites (id, name, domain) values ('mediseller', 'MediSeller', 'mediseller.com')
  on conflict (id) do nothing;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text not null unique,               -- e.g. MS-261101-K7QZ
  site_id          text not null references public.sites(id),
  created_at       timestamptz not null default now(),
  source           text not null check (source in ('checkout','quick_quote','contact','business','chat')),
  contact_channel  text not null check (contact_channel in ('whatsapp','rfq','email','call')),
  name             text not null,
  phone_raw        text,
  phone_e164       text not null,
  email            text,
  country          text not null,
  country_iso      char(2) not null,
  city             text,
  buyer_type       text,
  company          text,
  message          text,
  call_slot        text,
  call_tz          text,
  consent          boolean not null default false,
  rx_later         boolean not null default false,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  landing_page     text,
  referrer         text,
  status           text not null default 'new' check (status in ('new','contacted','quoted','won','lost','spam')),
  assigned_to      text,
  sheet_synced_at  timestamptz,
  crm_synced_at    timestamptz                          -- reserved for NeoDev CRM sync (later)
);
create index if not exists leads_site_created_idx on public.leads (site_id, created_at desc);
create index if not exists leads_phone_idx on public.leads (phone_e164);
create index if not exists leads_unsynced_idx on public.leads (site_id) where sheet_synced_at is null;

create table if not exists public.lead_items (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  product_sku   text,
  product_name  text not null,
  qty           integer not null check (qty > 0),
  unit          text,
  note          text
);
create index if not exists lead_items_lead_idx on public.lead_items (lead_id);

create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  kind          text not null default 'prescription',
  storage_path  text not null,
  mime          text,
  size          integer,
  created_at    timestamptz not null default now()
);
create index if not exists attachments_lead_idx on public.attachments (lead_id);

create table if not exists public.chat_sessions (
  id          uuid primary key,                       -- generated in the browser
  site_id     text not null references public.sites(id),
  lead_id     uuid references public.leads(id) on delete set null,
  page        text,
  started_at  timestamptz not null default now(),
  handed_off  boolean not null default false
);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- Row-level security ON with no policies: anon/authenticated roles get nothing; the service role bypasses RLS.
alter table public.sites          enable row level security;
alter table public.leads          enable row level security;
alter table public.lead_items     enable row level security;
alter table public.attachments    enable row level security;
alter table public.chat_sessions  enable row level security;
alter table public.chat_messages  enable row level security;

-- Private bucket for prescriptions (10 MB per file, images + PDF only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

-- Handy view for the team (Supabase table editor / future admin)
create or replace view public.leads_overview as
select l.ref_no, l.created_at, l.site_id, l.source, l.contact_channel, l.name, l.phone_e164, l.email,
       l.country, l.buyer_type, l.status, l.assigned_to,
       (select string_agg(i.product_name || ' × ' || i.qty || ' ' || coalesce(i.unit,''), '; ') from public.lead_items i where i.lead_id = l.id) as items,
       (select count(*) from public.attachments a where a.lead_id = l.id) as rx_files
from public.leads l
order by l.created_at desc;
alter view public.leads_overview set (security_invoker = true);
