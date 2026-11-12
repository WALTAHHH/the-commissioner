# Architecture Decision Records

## ADR-001: Modular Monolith

**Status:** Proposed  
**Decision:** Start with a modular monolith, not microservices.

Logical modules: Identity, League, Membership, Permissions, Rules, Governance, Finance, Communications, History, Integrations, AI, Audit.

## ADR-002: Provider-Agnostic Integration Architecture

**Status:** Proposed  
**Decision:** Each fantasy provider gets an independent adapter. Core product must not depend on any single provider.

## ADR-003: AI Uses Same Services as UI

**Status:** Proposed  
**Decision:** The AI orchestration layer must call the same domain services as the web UI. No direct database access from AI tools. Same authorization rules apply.

## ADR-004: Permission Service Before Financial Features

**Status:** Proposed  
**Decision:** RBAC permission service must be built before financial visibility and external agent access. Building those first creates expensive rework.
