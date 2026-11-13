# The Commissioner — Decisions Log

Decisions recorded by the orchestrator (Hermanito). Append new entries at the top.

---

## [2026-11] DB runtime client: Supabase JS client over HTTPS, not Drizzle

**Context:** Needed a production DB client for Next.js App Router on Vercel.  
**Decision:** Use `@supabase/supabase-js` for all runtime queries. Drizzle used for migration SQL generation only (`drizzle-kit`), never at runtime.  
**Alternatives considered:** Drizzle runtime client (postgres-js), Prisma.  
**Rationale:** Supabase free tier DB host is IPv6-only. Vercel serverless is IPv4-only. Transaction pooler not provisioned on this project. Supabase JS client queries over HTTPS — no TCP, no IPv6, no pooler issues. Drizzle at runtime would require a direct TCP connection that simply doesn't work here.  
**Consequences:** All runtime DB access goes through PostgREST. Column names must be snake_case in `.select()`. `auth.users` not exposed via PostgREST — use `supabase.auth.admin.getUserById()`. No transactions — multi-row atomic ops need Postgres RPC via `supabase.rpc()`.

---

## [2026-11] Auth: Supabase Auth (`@supabase/ssr`)

**Context:** Needed auth for commissioner and league member access control.  
**Decision:** Supabase Auth with `@supabase/ssr`.  
**Alternatives considered:** Clerk, NextAuth.  
**Rationale:** Already committed to Supabase for DB; using the same platform for auth minimizes surface area and keeps RLS policies tied directly to `auth.users`. Free tier covers current scale.  
**Consequences:** RLS policies are tied to `auth.uid()`. All server components and API routes must use the SSR client to properly propagate session cookies.

---

## [2026-11] First integration: Sleeper (non-commercial until monetization)

**Context:** Needed a fantasy platform to integrate for roster/league data import.  
**Decision:** Sleeper as the first integration target.  
**Alternatives considered:** ESPN (unofficial API, legally unclear), Yahoo (24hr data retention restriction).  
**Rationale:** Sleeper has a clean unofficial API, no auth required for public league data, and is non-commercial friendly for now. ESPN is legally risky; Yahoo's 24hr retention restriction is incompatible with historical data features.  
**Consequences:** ESPN and Yahoo deferred. If the product monetizes, revisit Sleeper TOS and renegotiate or formalize access.

---

## [2026-11] Styling: Tailwind v4 + shadcn/ui, Turbopack loader required

**Context:** Chose a styling stack for the Next.js 16 app.  
**Decision:** Tailwind v4 + shadcn/ui. Turbopack loader (`@tailwindcss/turbopack`) registered in `next.config.ts`.  
**Alternatives considered:** Tailwind v3, plain CSS, Chakra UI.  
**Rationale:** Tailwind v4 CSS-first config is cleaner; shadcn/ui provides accessible unstyled components we can theme. Turbopack is required for `next build` with Next.js 16+.  
**Consequences:** Without the Turbopack loader, `globals.css` ships verbatim and the production build is completely unstyled. `@tailwindcss/turbopack` must be in `devDependencies`.

---

## [2026-11] Design system: warm newsprint aesthetic

**Context:** Needed a visual identity for the product.  
**Decision:** Warm newsprint off-white base, ink near-black foreground, terracotta accent. Playfair Display headings + Geist body. Tight radius (6-8px). Notion/Linear meets broadsheet newspaper.  
**Alternatives considered:** Dark mode terminal aesthetic, sports app bright palette.  
**Rationale:** Commissioner-first admin tool — should feel authoritative and readable, not like a consumer sports app. The newspaper metaphor matches the "record keeper" framing of the product.  
**Consequences:** Design tokens in `docs/design-system.md`. Sticking to this palette is a constraint on all future UI cards.

---

## [2026-11] Payment processing: deferred post-PMF

**Context:** Leagues handle dues and payouts — financial processing is a natural feature.  
**Decision:** Deferred to Phase 3, post-PMF.  
**Alternatives considered:** Stripe integration in Phase 1 or 2.  
**Rationale:** PMF must be established before adding payment complexity. Auth and core governance features (rules, invites, membership) are the right focus first. Payment processing adds compliance and support burden that isn't worth taking on until the core product retains users.  
**Consequences:** Phase 3 is blocked on PMF signal from Phase 1/2.

---

## [2026-11] SQL migration protocol: Matt applies manually via Supabase SQL Editor

**Context:** Needed a process for running DB migrations.  
**Decision:** Wolo generates migration SQL via `drizzle-kit`. SQL is extracted and pasted in chat for Matt to run manually in Supabase SQL Editor.  
**Alternatives considered:** Auto-run migrations from CI, Wolo runs migrations in kanban worker.  
**Rationale:** Kanban workers don't have credentials to run DDL against production. CI auto-migrations on a free-tier project with no staging environment are risky. Manual apply keeps Matt in the loop on schema changes before they hit production.  
**Consequences:** Matt is on the critical path for any schema-changing card. Downstream cards should be blocked until Matt confirms migration applied.
