# Lead Tracker

Internal lead tracking for a small sales / outreach team. Next.js (App Router) + Convex (database, server functions, live sync) + Convex Auth (email + password), styled with Tailwind + shadcn-style components in an Attio-like indigo-on-zinc theme with light, dark and system modes.

Features: a spreadsheet-style leads grid with saved views, inline editing, filters, bulk actions and Excel import/export; admin-defined custom fields and statuses; self-claim and assignment; a shared meeting calendar with server-side double-booking protection; commission tracking; and member and admin dashboards.

---

## 1. Setup

Requirements: Node 20+ and npm.

```bash
npm install
```

### Convex

```bash
npx convex dev
```

The first run asks you to log in and create a project. It writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local`, pushes the schema and functions, and keeps watching for changes. Leave it running.

### Auth (Convex Auth)

Logins live in Convex too: email + password, passwords hashed (Scrypt), sign-in rate-limited. Generate the signing keys once per deployment:

```bash
npm run auth-keys -- http://localhost:3000
```

This sets `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` on the deployment in `.env.local`. For production, see section 4.

There's no self sign-up. Admins create every account (see below).

### Run

```bash
npm run dev          # Next.js on http://localhost:3000
```

Keep `npx convex dev` running in a second terminal.

### Seed demo data (optional)

```bash
npm run seed         # = npx convex run seed:run
```

This adds 2 demo members (Priya Sharma, and Arjun Mehta with a 10% rate override), 50 leads across all statuses, a few meetings on the next working days, and one Won lead with a pending commission. The demo members have no passwords; they only exist to fill the screens.

---

## 2. Making the first admin

**Option A: environment variables (no terminal).** In the Convex dashboard → your **production** deployment → Settings → Environment variables, add:

| Name | Value |
|---|---|
| `ADMIN_EMAIL` | you@company.com |
| `ADMIN_NAME` | Your Name |
| `ADMIN_PASSWORD` | a temporary password (8+ characters) |

Open `/sign-in`. On load, the page creates that admin, but only if the deployment has no active admin yet. Sign in with the temporary password and choose your own. Then **delete `ADMIN_PASSWORD`** from the dashboard. It no longer works anyway, and once an admin exists the variables are ignored.

**Option B: command line.**

```bash
npx convex run --prod users:createAdmin '{"email":"you@company.com","name":"Your Name","password":"a-temporary-password"}'
```

(With a deploy key instead of a logged-in CLI: `CONVEX_DEPLOY_KEY=<prod key> npx convex run users:createAdmin '{...}'`.)

Running it again for an existing email promotes that user to admin and sets a new temporary password. Use this if you ever lock yourself out.

## 3. Adding team members

Admins go to **Team → Add member** and enter a name, email, role and temporary password. A readable password is generated for you, and you can copy the sign-in details to share.

- On first sign-in, the member must replace the temporary password before they can use the app.
- **Reset password** sets a new temporary password, signs them out everywhere and forces another change. Use it for forgotten passwords, since there's no email reset.
- Anyone can change their own password from the key icon in the sidebar. Other devices get signed out.
- **Deactivate** blocks the account and signs it out. Leads stay assigned and visible to admins.

On the Team page admins can also change roles and set per-member commission rate overrides.

Don't run `npm run seed` against production. Its demo users have no passwords and use `@example.com` addresses.

---

## 4. Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. In Convex, open your project → **Settings → Deploy key** → generate a **Production** deploy key.
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `CONVEX_DEPLOY_KEY`: the production deploy key (the only variable Vercel needs)
4. Set the **Build Command** to:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   This deploys the Convex functions and injects `NEXT_PUBLIC_CONVEX_URL` into the Next build.
5. Set the auth keys on production once:
   ```bash
   CONVEX_DEPLOY_KEY='<prod deploy key>' npm run auth-keys -- https://<your-app>.vercel.app
   ```
   This generates `JWT_PRIVATE_KEY` and `JWKS` (only if missing) and sets `SITE_URL`.
6. Create the first admin (section 2).

---

## 5. Project layout

```
convex/                 Backend. Every public function checks permissions.
  schema.ts             Tables and indexes
  auth.ts               Convex Auth (password provider, no self sign-up)
  lib/auth.ts           requireUser / requireAdmin / lead visibility rules
  lib/leads.ts          All lead writes (keeps counters, search text and dedupe keys in sync)
  lib/shared.ts         Field validation (zod), shared with the client
  lib/slots.ts          Working-hours and slot-capacity checks
  leads.ts              List (cursor pagination + search), edit, status, claim, assign, bulk
  imports.ts            Batched Excel import with duplicate detection
  meetings.ts           Request / Meet link / outcome / reschedule (race-safe)
  commissions.ts        Commission list, edit, mark paid
  dashboard.ts          Member and admin dashboard queries
  seed.ts               Demo data
src/app/                Routes: dashboard, leads, calendar, commissions, team, settings
src/components/         UI by feature; ui/ holds the shadcn-style primitives
src/app/globals.css     Design tokens (light + dark). Components use only these.
```

### How the important rules are enforced

- **Permissions** are checked inside every Convex function, not only in the UI. Members see unassigned leads and their own leads, and can only edit their own. Settings, fields, statuses, assigning other people's leads and commissions are admin-only.
- **Claiming is atomic.** `leads.claim` reads and writes in one Convex transaction. If two people claim at once, one wins and the other gets "Already claimed by X".
- **No double-booking.** `meetings.request` and `meetings.reschedule` count active meetings for that slot via the `by_start_status` index and insert in the same transaction. Convex's optimistic concurrency makes this race-safe. Slots outside working hours, on blocked dates or in the past are rejected on the server.
- **Commission snapshots.** The rate and amount are stored on the commission when the lead is won, so later rate changes don't affect it. Moving a Won lead back to an open status voids its pending commission (after a confirmation).
- **Scale.** The leads grid uses cursor pagination (50 rows, then 100 per page on scroll), with indexes chosen per view and sort, and a search index on a denormalised `searchText`. Totals come from a `counters` document, so the sidebar count and dashboards don't scan 10k+ leads.

## 6. Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run dev:convex` | `convex dev` (watch + push functions) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Seed demo data |

Keyboard shortcuts: `⌘K` / `Ctrl+K` opens search, `⌘⇧L` / `Ctrl+Shift+L` toggles light/dark, arrow keys move between cells in the leads grid, `Enter` edits a cell and `Esc` cancels.
