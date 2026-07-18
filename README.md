# Northstar CRM

A focused revenue workspace for modern sales teams — built with Next.js (App Router),
PostgreSQL, and Drizzle ORM.

## Features

- **Overview dashboard** — KPI metrics, revenue chart, smart priorities
- **Sales pipeline** — drag-and-drop deals across stages
- **Contacts** — searchable relationship directory
- **Activities** — task management with completion tracking
- **Reports** — conversion funnel and forecast health
- **Global search**, notifications, and keyboard shortcuts (⌘K, ⌘1–3)
- Fully responsive (desktop + mobile), with optimistic UI updates
- Data persisted in PostgreSQL via Drizzle ORM

## Tech stack

- Next.js 16 (App Router, Server Actions)
- React 19
- PostgreSQL + Drizzle ORM
- Tailwind CSS v4
- lucide-react icons

## Getting started

### 1. Prerequisites

- Node.js 18+ (recommended 20+)
- A running PostgreSQL instance

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy the example env file and set your database connection string:

```bash
cp .env.example .env
```

Then edit `.env`:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

### 4. Create the database schema

Push the Drizzle schema to your database:

```bash
npx drizzle-kit push
```

### 5. Run the app

Development mode:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

The app runs at [http://localhost:3000](http://localhost:3000).

On the first page load, the workspace automatically seeds realistic demo data
(deals, contacts, and tasks) if the tables are empty.

## Project structure

```
src/
├── app/
│   ├── actions.ts          # Server actions (create/move deals, complete tasks)
│   ├── crm-dashboard.tsx   # Main client dashboard UI
│   ├── page.tsx            # Server component: seeds + loads data
│   ├── layout.tsx          # Root layout + metadata
│   ├── globals.css         # Design system & Tailwind
│   └── api/health/route.ts # Health check endpoint
└── db/
    ├── index.ts            # Drizzle client + pg pool
    ├── schema.ts           # Tables: deals, contacts, tasks
    └── seed.ts             # Idempotent demo-data seeding
```

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start dev server                   |
| `npm run build`     | Production build                   |
| `npm run start`     | Start production server            |
| `npm run lint`      | Run ESLint                         |
| `npm run typecheck` | Type-check with TypeScript         |
