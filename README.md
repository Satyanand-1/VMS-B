# AT VMS — web app

The working Arkhya Tech Vendor Management System, built from the PRD and the clickable prototype (`../prototype`).
Next.js (App Router, React, TypeScript) + Supabase (PostgreSQL, Auth, Storage). Screens use the prototype's stylesheet, so they look the same.

## Run it locally

Requirements: Node.js 20+, Docker Desktop (running).

```bash
cd web
npm install
npm run db:start     # starts local Supabase in Docker (first time downloads images)
npm run db:reset     # fresh, empty system with only the Super Admin (a.krishnan@arkhyatech.com / password123)
# or: npm run db:reset:sample   # loads the prototype's sample data instead (set NEXT_PUBLIC_DEMO_LOGINS=1 for the demo chips)
npm run dev          # http://localhost:3000
```

`.env.local` holds the local Supabase keys (Supabase CLI defaults), the encryption key and the SMTP settings. It is not committed.

| Local service | URL |
|---|---|
| App | http://localhost:3000 |
| Email inbox (all emails the app sends: login details, invites, reminders) | http://127.0.0.1:54324 |
| Database admin (Supabase Studio) | http://127.0.0.1:54323 |

Vendor consultants have no login: the Super Admin / Account Manager adds them, and their vendor submits their invoices and timesheets.
Login details (username + temporary password) are emailed only to vendors and W-2 / 1099 resources.

## Sample sign-ins after `db:reset:sample` (password `password123`)

| Role | Email |
|---|---|
| Super Admin | a.krishnan@arkhyatech.com |
| Account Manager | a.ross@arkhyatech.com |
| Vendor | d.ortiz@coralstaffing.com |
| W-2 resource | maya.reed@outlook.com |
| 1099 resource | jordan@blakeux.studio |
| New vendor (must set a new password at first sign-in) | contracts@harborviewstaffing.com |
| Expired password (day 31) | mprice@ridgelinetalent.com |
| Inactive vendor | billing@orbitsystems.com |

The sign-in page shows these as one-click chips while `NEXT_PUBLIC_DEMO_LOGINS=1`. Remove that variable outside development.

## What is where

| Path | What it is |
|---|---|
| `supabase/migrations/*.sql` | Database schema (plain SQL), indexes, constraints, private file bucket |
| `scripts/seed.mjs` | Sample data and sample files (from the prototype) |
| `src/lib/session.ts` | Sign-in session, role and data scope (who may see what), password expiry |
| `src/lib/actions/*` | Every write: server actions with validation, permission checks and audit entries |
| `src/lib/data.ts` | Scoped reads, document / review status rules |
| `src/app/(app)/*` | Screens (one folder per left-menu item); pop-ups open with `?m=…` so Back closes them |
| `src/components/*` | Shared UI: page frame, tables, forms, upload rows, pop-ups |
| `src/styles/prototype.css` | The prototype stylesheet (design reference) |
| `src/app/api/files/[key]` | View / Download: checks access, then a 5-minute signed link |
| `src/app/api/cron/[job]` | Daily jobs: `document-expiry`, `password-expiry`, `audit-retention` (needs `CRON_SECRET`) |

## Security model

- All data access runs on the server. Row Level Security is on for every table with no browser access; the server checks the user's role
  and scope (Super Admin: all; Account Manager: own clients and vendors; Vendor: own consultants; Resource: self) before every read and write.
- SSN and EIN are encrypted (AES-256-GCM) with `ENCRYPTION_KEY`; only the last 4 digits are shown.
- Files are in a private bucket; uploads are checked for type (PDF, DOCX, JPG, PNG — by content, not only extension) and 5 MB.
- The audit log is append-only.

## Deploying (staging / production)

1. Create a Supabase project. Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
2. Host the Next.js app (Vercel recommended) with these environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` (64 hex chars, new per environment),
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_BASE_URL`, `CRON_SECRET`.
3. Create the first Super Admin (Supabase Auth user + a `user_accounts` row with role `super_admin`). Everyone else is created from the app.
4. Schedule daily `POST /api/cron/document-expiry`, `/api/cron/password-expiry` and `/api/cron/audit-retention` with `Authorization: Bearer <CRON_SECRET>`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop / production build / run the build |
| `npm run db:start` / `db:stop` | Start / stop local Supabase |
| `npm run db:reset` | Recreate an empty database with only the Super Admin |
| `npm run db:reset:sample` | Recreate the database with the prototype's sample data |
| `npm run typecheck` / `npm run lint` | Type-check / lint |
