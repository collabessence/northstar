# Northstar CRM

A focused revenue + recruiting workspace — built with Next.js (App Router),
PostgreSQL, and Drizzle ORM. Two verticals sharing one app: a **Sales CRM**
and a **Recruiting CRM**, switchable from the sidebar.

## Features

### Sales CRM (`/`)
- Overview dashboard — KPI metrics with real period-over-period deltas, revenue chart, smart priority suggestion
- Sales pipeline — Kanban **and** flat sortable list view, drag-and-drop between stages
- Contacts — searchable relationship directory, full edit support
- Activities — task management with due dates and **automatic overdue notifications**
- Reports — conversion funnel and forecast health
- Real activity feed (notifications) driven by actual actions, not sample data
- Global search, keyboard shortcuts (⌘K, ⌘1–3)
- All monetary values in **PLN**

### Recruiting CRM (`/recruitment`)
- Candidates, clients, job orders, and a dedicated hiring pipeline (Sourced → Screened → Submitted → Interview → Offer → Placed)
- Fee locked in at offer time based on agreed salary × job order fee %
- **CV import**: upload a `.pdf`/`.docx`, fields (name, email, phone, date of birth, city) are extracted automatically via local regex parsing — no external API, nothing leaves your server — then reviewed before a candidate is created
- **GDPR-compliant erasure**: "End process & erase data" permanently deletes a candidate's profile and every linked pipeline entry and task (cascading foreign keys), with only a non-personal timestamp log left as proof an erasure happened

### Shared
- Optional shared-password login gate (`SITE_PASSWORD` env var) for previewing the app publicly before real auth exists
- "Load sample data" / "Clear all data" from Settings — **nothing auto-seeds**; a fresh database starts genuinely empty
- Optimistic UI updates, data persisted in PostgreSQL via Drizzle ORM

### Known limitations (being worked on)
- Desktop-first: mobile layout has not been validated/polished yet
- Pipeline stages are fixed, not yet configurable per team/process
- No per-user accounts — single shared workspace identity

## Tech stack

- Next.js 16 (App Router, Server Actions, Proxy/Middleware)
- React 19
- PostgreSQL + Drizzle ORM
- Tailwind CSS v4
- lucide-react icons
- `pdf-parse` + `mammoth` for CV text extraction (no AI/external API)

## Getting started

### 1. Prerequisites

- Node.js 18+ (recommended 20+)
- A running PostgreSQL instance (e.g. [Neon](https://neon.tech), free tier)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
# Optional — gates the whole app behind a shared password when set
# SITE_PASSWORD=choose-a-real-password
```

**Never commit a real `DATABASE_URL` anywhere other than `.env`** — `drizzle.config.ts` reads it from the environment on purpose, so no config file needs to contain a real credential.

### 4. Create the database schema

```bash
npx drizzle-kit push
```

This pushes both `src/db/schema.ts` (Sales) and `src/db/recruitment-schema.ts` (Recruiting).

### 5. Run the app

```bash
npm run dev
```

Both workspaces start **empty** — use the "Load sample data" option in Settings (or the empty-state banner) to explore with realistic demo data.

Production build:

```bash
npm run build
npm run start
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
├── proxy.ts                       # Password-gate middleware
├── app/
│   ├── actions.ts                 # Sales server actions
│   ├── crm-dashboard.tsx          # Sales dashboard UI
│   ├── page.tsx                   # Sales: loads data (no auto-seed)
│   ├── layout.tsx                 # Root layout + metadata
│   ├── globals.css                # Design system & Tailwind
│   ├── api/health/route.ts        # Health check endpoint
│   ├── login/                     # Shared-password login flow
│   └── recruitment/
│       ├── actions.ts             # Recruiting server actions
│       ├── cv-actions.ts          # CV upload → text extraction
│       ├── recruitment-dashboard.tsx
│       ├── page.tsx
│       └── seed.ts
├── components/workspace-switcher.tsx
├── lib/
│   ├── metrics.ts                 # Sales calculations (scoring, forecast, revenue)
│   ├── recruitment-metrics.ts     # Recruiting calculations (fees, time-to-fill)
│   ├── cv-parser.ts               # Regex-based CV field extraction
│   ├── format.ts                  # Shared money/date formatting (PLN)
│   └── auth.ts                    # Login-gate session token logic
└── db/
    ├── index.ts                   # Drizzle client + pg pool
    ├── schema.ts                  # Sales tables
    ├── recruitment-schema.ts      # Recruiting tables
    ├── seed.ts / recruitment/seed.ts  # On-demand sample data
    ├── snapshots.ts / recruitment-snapshots.ts  # Daily metric snapshots (real deltas)
    └── activity.ts                # Sales activity feed
```

## Scripts

| Command             | Description                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start dev server                   |
| `npm run build`     | Production build                   |
| `npm run start`     | Start production server            |
| `npm run lint`      | Run ESLint                         |
| `npm run typecheck` | Type-check with TypeScript         |
