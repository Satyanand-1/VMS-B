-- AT VMS — initial schema (plain SQL; runs on any PostgreSQL 15+ except the auth.users FK and storage bucket at the end).
-- Access model: Row Level Security is enabled on every table with NO policies for anon/authenticated, so the browser
-- can never read or write tables directly. All reads and writes go through the Next.js server, which checks the
-- signed-in user's role and scope first (lib/auth/scope.ts) and then uses the service role.

create extension if not exists pgcrypto;

create type app_role as enum ('super_admin', 'account_manager', 'vendor', 'resource');
create type person_type as enum ('consultant', 'w2', 'w1099');

-- Everyone who signs in. Clients and vendor consultants without a login are records, not accounts.
create table user_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null,
  email text not null unique,
  full_name text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'invited', 'inactive')),
  password_set_at timestamptz,
  password_expires_at timestamptz,          -- external users only (30 days); null for staff
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  vendor_id uuid,                            -- role = vendor
  person_id uuid,                            -- role = resource (or a consultant with a login)
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null,                        -- short code used in file names, e.g. PER
  address text,
  email text,
  currency text not null default 'USD',
  time_zone text not null default 'America/New_York',
  region text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table client_account_managers (
  client_id uuid not null references clients (id) on delete cascade,
  account_manager_id uuid not null references user_accounts (id) on delete cascade,
  primary key (client_id, account_manager_id)
);

create table payment_terms (
  label text primary key,
  sort int not null default 100,
  is_custom boolean not null default false
);
insert into payment_terms (label, sort) values
  ('Net 10', 1), ('Net 7', 2), ('Net 15', 3), ('Net 30', 4), ('Net 45', 5), ('Net 60', 6), ('Immediate', 7);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  address text,
  email text not null unique,
  ein_last4 text,
  ein_enc text,                              -- AES-256-GCM, encrypted in the app
  phone text,
  state_of_incorporation text,
  signatory_name text,
  signatory_phone text,
  contact_name text,
  payment_term text not null default 'Net 10',
  account_manager_id uuid not null references user_accounts (id),
  status text not null default 'active' check (status in ('active', 'onboarding', 'invited', 'inactive')),
  created_at timestamptz not null default now()
);

-- People: vendor consultants, W-2 and 1099 resources. One client assignment at a time (TM-9), kept on the row.
create table people (
  id uuid primary key default gen_random_uuid(),
  type person_type not null,
  full_name text not null,
  email text not null unique,
  phone text,
  address text,
  ssn_last4 text,
  ssn_enc text,
  vendor_id uuid references vendors (id),
  status text not null default 'active' check (status in ('active', 'onboarding', 'inactive', 'ended')),
  role_title text,
  client_id uuid references clients (id),    -- null = not mapped yet (consultants)
  hourly_rate numeric(10, 2),
  start_date date,
  end_date date,
  duration text,
  work_location text,
  payment_term text default 'Net 10',
  account_manager_id uuid references user_accounts (id),
  created_at timestamptz not null default now(),
  check ((type = 'consultant') = (vendor_id is not null))
);
alter table user_accounts add constraint user_accounts_vendor_fk foreign key (vendor_id) references vendors (id);
alter table user_accounts add constraint user_accounts_person_fk foreign key (person_id) references people (id);

-- Documents and their versions (never updated or deleted; replacing adds a version).
create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'vendor', 'person')),
  owner_id uuid not null,
  doc_type text not null,                    -- MSA, PO, W-9, COI, ACH form, Resume, I-9, E-Verify document, Audit report, ...
  uploader_kind text not null default 'staff' check (uploader_kind in ('staff', 'vendor', 'resource')),
  no_dates boolean not null default false,   -- e.g. Resume, ACH form, payslips
  valid_from date,
  valid_to date,
  audit_period text,                         -- "Jul 1, 2026 – Dec 31, 2026 (6 months)"
  not_applicable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_kind, owner_id, doc_type)
);
create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version_no int not null,
  storage_path text not null,
  file_name text not null,
  size_bytes int,
  mime_type text,
  uploaded_by uuid references user_accounts (id),
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  valid_to date,
  unique (document_id, version_no)
);

-- Monthly submissions: vendor invoice + timesheet per consultant, 1099 invoice + timesheet, W-2 timesheet.
create table submissions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                  -- INV-2026-10-0203 / TS-2026-10-0093
  person_id uuid not null references people (id),
  client_id uuid not null references clients (id),
  period date not null,                      -- first day of the billing month
  version_no int not null default 1,
  hours numeric(6, 2) not null check (hours > 0),
  hourly_rate numeric(10, 2) not null,
  amount numeric(12, 2),                     -- null for W-2 timesheets
  invoice_path text, invoice_name text,
  timesheet_path text, timesheet_name text,
  status text not null default 'in_progress' check (status in ('in_progress', 'approved', 'rejected', 'superseded')),
  reject_reason text,
  submitted_by uuid references user_accounts (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references user_accounts (id),
  reviewed_at timestamptz
);
-- One active invoice (or W-2 timesheet) per person per month (INV-8). A rejected one blocks a new submission;
-- it is resubmitted instead (the rejected row becomes superseded).
create unique index submissions_one_active_per_month on submissions (person_id, period)
  where status in ('in_progress', 'approved', 'rejected');

create table client_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  person_id uuid not null references people (id),
  period date not null,
  hours numeric(6, 2) not null check (hours > 0),
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references user_accounts (id),
  uploaded_at timestamptz not null default now(),
  unique (person_id, period)
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  kind text not null check (kind in ('remind', 'request')),
  sent_by uuid references user_accounts (id),
  sent_on date not null default current_date,
  unique (document_id, kind, sent_on)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_accounts (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  voided_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_accounts (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_log (
  id bigserial primary key,
  template text not null,
  to_address text not null,
  subject text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

-- Append-only audit trail (AUD-1).
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  summary text not null,
  before jsonb,
  after jsonb
);
create or replace function audit_log_no_change() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_append_only before update on audit_log for each row execute function audit_log_no_change();

-- A client always keeps at least one account manager (CL-8).
create or replace function keep_one_client_am() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from client_account_managers where client_id = old.client_id)
     and exists (select 1 from clients where id = old.client_id) then
    raise exception 'A client must have at least one account manager';
  end if;
  return null;
end $$;
create constraint trigger client_keeps_am after delete on client_account_managers
  deferrable initially deferred for each row execute function keep_one_client_am();

create index on people (vendor_id);
create index on people (client_id);
create index on submissions (client_id, period);
create index on client_invoices (client_id, period);
create index on documents (owner_kind, owner_id);
create index on audit_log (at desc);

-- Row Level Security: on, with no policies — only the server (service role) can access these tables.
alter table user_accounts enable row level security;
alter table clients enable row level security;
alter table client_account_managers enable row level security;
alter table payment_terms enable row level security;
alter table vendors enable row level security;
alter table people enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table submissions enable row level security;
alter table client_invoices enable row level security;
alter table reminders enable row level security;
alter table invites enable row level security;
alter table notifications enable row level security;
alter table email_log enable row level security;
alter table audit_log enable row level security;

-- Private file bucket (5 MB per file; PDF, DOCX, JPG, PNG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vms-files', 'vms-files', false, 5242880,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
