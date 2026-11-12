# The Commissioner

**AI-native fantasy football commissioner platform.**

An administrative OS for private fantasy leagues — not another scoring app. Runs alongside ESPN, Sleeper, Yahoo, etc. and owns the administrative experience:

- League setup and configuration
- Membership, roles, and permissions (RBAC)
- Rules, governance, and voting
- Dues, obligations, and financial recordkeeping
- Announcements and communications
- Historical records and league continuity
- AI-assisted league management
- External agent access via MCP

## Project Status

🚧 **Phase 0 — Discovery & Scaffolding**

Product spec written. Stack TBD. Discovery workstreams in progress:
- Fantasy platform API feasibility
- Permission model design
- AI/MCP architecture
- MVP screen flows

## Planned Stack

| Layer | Candidate |
|---|---|
| Frontend | Next.js / React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | PostgreSQL (Supabase) |
| Auth | Clerk or Supabase Auth |
| AI | Provider-independent abstraction |
| Agent interop | MCP |
| Hosting | Vercel |

## Docs

- [`/docs/spec.md`](docs/spec.md) — Full product specification (v0.3)
- [`/docs/architecture.md`](docs/architecture.md) — Architecture decision records
- [`/docs/permission-model.md`](docs/permission-model.md) — RBAC design

## Development

```bash
# TBD — stack not finalized
```

## License

Private
