# Lead Tracker

Internal lead tracking for a small sales / outreach team. Next.js (App Router) + Convex (database, server functions, live sync) + Clerk (auth), styled with Tailwind + shadcn-style components in an Attio-like indigo-on-zinc theme with light, dark and system modes.

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

### Clerk

1. Create an application at <https://dashboard.clerk.com>.
2. Copy the keys into `.env.local` (see `.env.example`):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   ```
3. Clerk Dashboard → **JWT Templates** → **New template** → **Convex**. Keep the name `convex`. Copy its **Issuer** URL.
4. Set the issuer on the Convex deployment (not in `.env.local`):
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   ```
5. Clerk → **User & authentication → Email, phone, username**: make sure **Email address** and **Password** are on.
6. Clerk → **Restrictions** → set sign-up mode to **Restricted**. Nobody signs up on their own; admins add people from the Team page.

### Run

```bash
npm run dev          # Next.js on http://localhost:3000
```

Keep `npx convex dev` running in a second terminal.

### Seed demo data (optional)

```bash
npm run seed         # = npx convex run seed:run
```

This adds 2 demo members (Priya Sharma, and Arjun Mehta with a 10% rate override), 50 leads across all statuses, a few meetings on the next working days, and one Won lead with a pending commission. The demo members have no Clerk accounts; they only exist to fill the screens.

---

## 2. Making the first admin

There's no self sign-up. The first admin is created directly in the **production** Convex database:

```bash
npx convex run --prod users:createAdmin '{"email":"you@company.com","name":"Your Name"}'
```

(With a deploy key instead of a logged-in CLI: `CONVEX_DEPLOY_KEY=<prod deploy key> npx convex run users:createAdmin '{...}'`.)

Then create the same email in Clerk: Dashboard → **Users → Create user**, with a password. Sign in at `/sign-in`. Your Clerk account is linked to the admin row by its verified email on first sign-in.

The same command promotes an existing user to admin if you ever lock yourself out.

## 3. Adding team members

Admins go to **Team → Add member** and enter a name, email, role and temporary password. A readable password is generated for you, and you can copy the sign-in details to share.

- This creates the Clerk account (via `/api/members`, using `CLERK_SECRET_KEY`) and the Convex user row.
- On first sign-in, the member must replace the temporary password before they can use the app.
- **Reset password** on the Team page sets a new temporary password, signs them out everywhere and forces another change.
- Anyone else can change their own password from the key icon in the sidebar.
- Someone who signs in without being added sees "No access yet".

On the Team page admins can also:

- change a member's role
- deactivate a member. They can no longer use the app, but their leads stay assigned and visible to admins for reassignment.
- set a per-member commission rate override

Don't run `npm run seed` against production. Its demo users use `@example.com` addresses.

---

## 4. Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. In Convex, open your project → **Settings → Deploy key** → generate a **Production** deploy key.
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `CONVEX_DEPLOY_KEY`: the production deploy key
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: your production Clerk instance's keys
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
4. Set the **Build Command** to:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   This deploys the Convex functions and injects `NEXT_PUBLIC_CONVEX_URL` into the Next build.
5. Set the issuer on the **production** Convex deployment:
   ```bash
   npx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain>
   ```
6. Create the `convex` JWT template in your production Clerk instance as well.

---

## 5. Project layout

```
convex/                 Backend. Every public function checks permissions.
  schema.ts             Tables and indexes
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
