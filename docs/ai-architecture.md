# AI/MCP Architecture Decision Record

**Status:** Proposed  
**Decision:** Define AI orchestration layer design, tool registry pattern, MCP server integration, agent authorization, safety rules, and phased rollout.

## Context

The Commissioner platform aims to provide AI-native assistant capabilities for league commissioners and members. AI agents and MCP (Model Context Protocol) integrations must interact with league data and perform actions safely, respecting the same business rules and permissions as human users via the web UI.

## Decisions

### ADR-005: AI Orchestration Layer Calls Domain Services

**Decision:** The AI orchestration layer will invoke domain services (LeagueService, MembershipService, PermissionService, etc.) via their public interfaces, never accessing the database directly. This ensures that all business logic, validation, and authorization applied to UI actions also apply to AI actions.

**Rationale:** Maintaining a single source of truth for business rules reduces bugs, security gaps, and drift between UI and AI behavior. It also simplifies testing and auditing.

**Consequences:** Domain services must be designed with AI-friendly APIs (clear input/output, idempotent where possible). AI-specific adapters may be added but must delegate to the core services.

### ADR-006: Tool Registry Pattern

**Decision:** AI tools will be registered in a central registry (`src/lib/ai/tools.ts`) with metadata including:
- Name
- Description
- Required permission (e.g., `league:read`, `league:write`, `finance:write`)
- Requires confirmation (boolean) – write tools that change state must ask for user confirmation before execution.
- Idempotent (boolean) – indicates whether the tool can be safely retried.

Tools are divided into **read-only** and **write** categories. Read-only tools do not require confirmation and can be called directly by authorized agents. Write tools require confirmation (either via user-in-the-loop approval or a prior confirmation step) unless the agent has been explicitly granted autonomous write privileges (see authorization model).

**Initial read tools:**
- `get_league_summary`
- `get_league_rules`
- `get_member_directory`
- `get_financial_summary`
- `get_outstanding_obligations`
- `get_activity_history`

**Initial write tools (interface only for now):**
- `create_announcement`
- `create_poll`
- `create_financial_obligation`

**Rationale:** A declarative registry enables automated generation of tool schemas for AI SDKs (OpenAI tools, Anthropic tools, MCP). It also centralizes safety and permission checks.

**Consequences:** Each new tool must be added to the registry with appropriate metadata. Tool implementations must enforce the declared permissions and confirmation requirements.

### ADR-007: MCP Server Uses Application Services

**Decision:** The MCP server will be a separate process (or Next.js route) that imports and calls the same domain services used by the web UI and AI orchestration layer. It will not have its own business logic or database access.

**Rationale:** This ensures consistency across all access channels (UI, AI, MCP). It also allows the MCP server to benefit from existing authentication, authorization, logging, and rate limiting.

**Consequences:** The MCP server must be kept lightweight, acting as a thin adapter between the MCP protocol and domain service calls. It must not introduce new business logic.

### ADR-008: Agent Authorization Model

**Decision:** Agents authenticate via OAuth delegated auth (Supabase Auth) and are scoped to a specific league. Permissions are derived from the user’s role within that league (commissioner, officer, member, guest). Each tool declares a required permission; the agent must possess that permission in the target league to invoke the tool.

**Rationale:** Reusing the existing permission system ensures that agents cannot exceed the privileges of the user they represent. League‑scoping prevents accidental cross‑league data exposure.

**Consequences:** Agents must be initialized with a valid user session and league context. Permission checks happen at the service layer, not just in the tool registry.

### ADR-009: Agent Safety Rules

**Decision:** The following safety rules will be enforced:

1. **Prompt injection mitigations:** All user‑provided text that could be passed to an AI tool will be sanitized (strip HTML, limit length, escape dangerous characters). Agent prompts will be constructed server‑side, not concatenated from untrusted inputs.

2. **Rate limits:** Each league will have a configurable rate limit (e.g., 100 AI tool calls per hour) to prevent abuse. Limits apply per user‑agent pair.

3. **Audit events:** Every AI tool invocation will generate an audit event capturing the agent, tool, parameters, user, league, timestamp, and outcome. Audit logs are immutable and visible to league commissioners.

4. **Confirmation for write tools:** Unless the agent has been granted autonomous write privileges (a commissioner‑level setting), write tools will require explicit user confirmation before execution. The confirmation step will present the proposed action and its parameters to the user (via UI or chat) and await approval.

5. **Idempotency keys:** Write tools that are idempotent will accept an optional idempotency key to prevent duplicate operations when retries occur.

**Rationale:** Safety is critical when granting automation over league administration. These measures reduce risk while preserving utility.

**Consequences:** Additional implementation effort for audit logging, rate‑limiting, and confirmation flows. Some latency introduced for write operations.

### ADR-010: Phased Rollout

**Decision:** AI/MCP capabilities will be rolled out in four phases:

1. **MVP read‑only:** Implement read‑only tools and a simple AI chat interface that can answer questions about league data. No write capabilities, no MCP.

2. **Confirmed writes:** Add write tools with user‑in‑the‑loop confirmation. Agents can propose actions, but a human must approve each write before execution.

3. **MCP read‑only:** Expose read‑only tools via an MCP server, allowing external AI agents (e.g., Claude Desktop, Cursor) to query league data.

4. **MCP write:** Expose write tools via MCP, still requiring confirmation unless autonomous writes are explicitly enabled per league.

**Rationale:** Incremental deployment reduces risk and allows feedback at each stage. It also aligns with product priorities (read‑only utility first).

**Consequences:** Each phase must be completed and validated before moving to the next. The architecture must support all four phases from the start (i.e., confirmation hooks, audit logs, etc.).

## Implementation Notes

- The tool registry (`src/lib/ai/tools.ts`) will define TypeScript interfaces for each tool, including metadata fields.
- The context builder (`src/lib/ai/context.ts`) will produce a `LeagueContext` object containing the authenticated user’s identity, league membership, permissions, rules, financial summary, and upcoming events. This context will be passed to AI prompts and tool‑calling logic.
- Domain services must be designed with AI‑friendly signatures (e.g., returning structured data, accepting league‑scoped parameters).