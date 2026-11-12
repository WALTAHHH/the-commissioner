# The Commissioner – Fantasy Sports Platform

A Next.js 16 application with Supabase Auth, Postgres database via Drizzle ORM, and shadcn/ui components.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Authentication**: Supabase Auth (@supabase/ssr)
- **Database**: Supabase Postgres + Drizzle ORM
- **Deployment**: Vercel

## Getting Started

### Prerequisites

1. Node.js 18+
2. npm / yarn / pnpm / bun
3. A Supabase project (already created: `ylqmmfzyicrcuripuejj`)

### Environment Variables

Copy the environment template and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://ylqmmfzyicrcuripuejj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SECRET_KEY=your-cookie-secret
DATABASE_URL=postgresql://postgres:password@db.ylqmmfzyicrcuripuejj.supabase.co:5432/postgres
```

Get the `SUPABASE_SERVICE_ROLE_KEY` and database password from the Supabase dashboard (Project Settings → API). The `SUPABASE_SECRET_KEY` can be any random string (generate with `openssl rand -base64 32`).

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
├── app/                 # Next.js App Router pages & layouts
├── components/          # React components (shadcn/ui)
├── src/
│   ├── db/             # Drizzle schema definitions
│   ├── lib/            # Database client & auth utilities
│   └── utils/          # Supabase client helpers
├── middleware.ts        # Supabase session refresh middleware
└── drizzle.config.ts   # Drizzle kit configuration
```

## Database & Migrations

This project uses Drizzle ORM with Supabase Postgres. To create a migration after updating `src/db/schema.ts`:

```bash
npx drizzle-kit generate
```

Apply the migration:

```bash
npx drizzle-kit migrate
```

For production, migrations should be run via the Supabase SQL editor or a CI/CD pipeline.

## Authentication

Supabase Auth is configured for the App Router using `@supabase/ssr`. The middleware automatically refreshes expired sessions.

- `src/utils/supabase/client.ts` – browser client
- `src/utils/supabase/server.ts` – server client (cookies)
- `src/lib/auth.ts` – convenience wrappers for sign‑up, sign‑in, sign‑out

## Deployment

1. Push the repository to GitHub.
2. Connect your Vercel project to the repository.
3. Add the same environment variables in the Vercel project settings.
4. Deploy.

The project includes a `vercel.json` with essential configuration.

## Useful Scripts

- `npm run dev` – start development server
- `npm run build` – build for production
- `npm start` – start production server
- `npx drizzle-kit studio` – open Drizzle Studio for database inspection

## Contributing

Please read the [Architecture ADRs](./docs/architecture.md) and [Specification](./docs/spec.md) before making changes.