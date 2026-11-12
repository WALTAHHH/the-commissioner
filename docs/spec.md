# Fantasy Football Commissioner Platform — Product Spec

**Version:** 0.3  
**Status:** Product direction defined; technical discovery and implementation planning

See the full spec in the project knowledge base.

## Summary

Build an AI-native, commissioner-first operating system for private fantasy football leagues.

The product sits alongside existing fantasy platforms rather than replacing them.
It owns the administrative experience: setup, membership, permissions, rules, governance, dues, communications, history, and AI-assisted management.

## Phases

- **Phase 0:** Technical and market discovery
- **Phase 1:** Commissioner MVP
- **Phase 2:** Automation and integrations
- **Phase 3:** Financial functionality (deferred post-PMF)
- **Phase 4:** Expansion

## Architecture

Modular monolith. Next.js + TypeScript + Tailwind + shadcn/ui + PostgreSQL.

## Development Guardrails

1. No core feature should require a fantasy platform integration.
2. No core feature should require AI.
3. All league data must be tenant-isolated.
4. All permissions must be enforced server-side.
5. AI and MCP must use the same application services and authorization rules as the UI.
6. Financial changes must be auditable.
7. Do not build payment custody into the MVP.
8. Do not build microservices before there is a demonstrated need.
