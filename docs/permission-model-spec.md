# Permission Model Specification

This document defines the complete permission catalog, default roles, role-permission assignments, member override logic, and financial visibility modes for The Commissioner platform.

## Permission Catalog

Permissions are categorized by domain, resource, and action. Each permission is identified by a key `{domain}.{resource}.{action}`.

| Domain | Resource | Action | Description |
|--------|----------|--------|-------------|
| league | league | create | Create a new league |
| league | league | view | View league settings |
| league | league | edit | Edit league settings |
| league | league | delete | Delete a league |
| league | league | invite | Invite members to league |
| league | league | remove | Remove members from league |
| league | league | assign_roles | Assign roles to members |
| membership | member | view | View member list and profiles |
| membership | member | invite | Invite a new member |
| membership | member | remove | Remove a member |
| membership | member | edit_role | Change a member's roles |
| rules | rule | create | Create a new rule |
| rules | rule | view | View existing rules |
| rules | rule | edit | Edit a rule |
| rules | rule | delete | Delete a rule |
| rules | rule | vote | Vote on a rule proposal |
| financial | ledger | view | View financial ledger (read-only) |
| financial | ledger | create | Create a new transaction |
| financial | ledger | edit | Edit an existing transaction |
| financial | ledger | delete | Delete a transaction |
| financial | ledger | approve | Approve a pending transaction |
| financial | report | view | View financial reports |
| communications | announcement | send | Send league-wide announcements |
| communications | message | post | Post messages in chat |
| communications | message | delete | Delete any message (moderation) |
| communications | message | view | View chat messages |
| historical | history | view | View league historical records |
| historical | history | export | Export historical data |
| historical | history | restore | Restore previous state (rollback) |
| ai | agent | create | Create an AI agent |
| ai | agent | edit | Edit agent configuration |
| ai | agent | delete | Delete an agent |
| ai | agent | view | View existing agents |
| ai | agent | execute | Trigger an agent execution |
| integrations | integration | create | Create an integration (e.g., webhook) |
| integrations | integration | edit | Edit integration |
| integrations | integration | delete | Delete integration |
| integrations | integration | view | View integrations |

### Financial Visibility vs Editing Rights

Financial visibility is controlled by `financial.ledger.view` permission, while editing rights are controlled by `financial.ledger.create`, `financial.ledger.edit`, `financial.ledger.delete`. This allows a member to have read‑only ledger access without edit permissions.

## Default Roles

The platform defines the following default roles for each league. Each role is league‑scoped (i.e., a user may have different roles in different leagues).

1. **Commissioner** – Full control over the league.
2. **Co‑commissioner** – Nearly full control, but cannot delete the league or remove the commissioner.
3. **Treasurer** – Manages financial records; may also have membership visibility.
4. **Rules administrator** – Manages rule creation, editing, deletion, and voting.
5. **Historian** – Manages historical records and exports.
6. **Member** – Standard league participant with basic viewing and interaction.
7. **Guest** – Limited view‑only access (e.g., invited observers).

## Role‑Permission Assignments

The following table maps default roles to permissions. A checkmark (✓) indicates the permission is granted by default.

| Permission | Commissioner | Co‑commissioner | Treasurer | Rules admin | Historian | Member | Guest |
|------------|---------------|------------------|-----------|-------------|-----------|--------|-------|
| league.league.create | ✓ | – | – | – | – | – | – |
| league.league.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| league.league.edit | ✓ | ✓ | – | – | – | – | – |
| league.league.delete | ✓ | – | – | – | – | – | – |
| league.league.invite | ✓ | ✓ | – | – | – | – | – |
| league.league.remove | ✓ | ✓ | – | – | – | – | – |
| league.league.assign_roles | ✓ | ✓ | – | – | – | – | – |
| membership.member.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| membership.member.invite | ✓ | ✓ | – | – | – | – | – |
| membership.member.remove | ✓ | ✓ | – | – | – | – | – |
| membership.member.edit_role | ✓ | ✓ | – | – | – | – | – |
| rules.rule.create | ✓ | ✓ | – | ✓ | – | – | – |
| rules.rule.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| rules.rule.edit | ✓ | ✓ | – | ✓ | – | – | – |
| rules.rule.delete | ✓ | ✓ | – | ✓ | – | – | – |
| rules.rule.vote | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| financial.ledger.view | ✓ | ✓ | ✓ | – | – | ✓ | – |
| financial.ledger.create | ✓ | ✓ | ✓ | – | – | – | – |
| financial.ledger.edit | ✓ | ✓ | ✓ | – | – | – | – |
| financial.ledger.delete | ✓ | ✓ | ✓ | – | – | – | – |
| financial.ledger.approve | ✓ | ✓ | ✓ | – | – | – | – |
| financial.report.view | ✓ | ✓ | ✓ | – | – | ✓ | – |
| communications.announcement.send | ✓ | ✓ | – | – | – | – | – |
| communications.message.post | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| communications.message.delete | ✓ | ✓ | – | – | – | – | – |
| communications.message.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| historical.history.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| historical.history.export | ✓ | ✓ | – | – | ✓ | – | – |
| historical.history.restore | ✓ | ✓ | – | – | ✓ | – | – |
| ai.agent.create | ✓ | ✓ | – | – | – | – | – |
| ai.agent.edit | ✓ | ✓ | – | – | – | – | – |
| ai.agent.delete | ✓ | ✓ | – | – | – | – | – |
| ai.agent.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ai.agent.execute | ✓ | ✓ | – | – | – | – | – |
| integrations.integration.create | ✓ | ✓ | – | – | – | – | – |
| integrations.integration.edit | ✓ | ✓ | – | – | – | – | – |
| integrations.integration.delete | ✓ | ✓ | – | – | – | – | – |
| integrations.integration.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Note:** The above assignments are defaults for newly created leagues. League commissioners may customize role‑permission mappings per league.

## Member Override Logic

The permission system evaluates a member's effective permissions in the following order:

1. **Deny‑by‑default** – If no rule explicitly grants a permission, the request is denied.
2. **Role‑based permissions** – Permissions are aggregated from all roles assigned to the member within the league. A role may grant (or explicitly deny) a permission via the `role_permissions` table.
3. **Member‑specific overrides** – The `member_permission_overrides` table can override any role‑based permission with an explicit `granted` (true) or `denied` (false) flag. Overrides take precedence over role‑based permissions.

Evaluation pseudocode:

```
function authorize(userId, leagueId, action):
  member = find league_members where user_id = userId and league_id = leagueId
  if not member: return false

  permissions = set()
  // collect from roles
  for each role in member.roles:
    for each permission granted to role:
      permissions[permission] = true
    for each permission denied to role:
      permissions[permission] = false

  // apply overrides
  for each override for member:
    permissions[override.permission] = override.granted

  // deny by default
  return permissions[action] ?? false
```

## Financial Visibility Modes

Financial visibility can be configured per member via the `financial.ledger.view` permission. Editing rights are controlled separately via `financial.ledger.create`, `.edit`, `.delete`, and `.approve`. This allows fine‑grained configurations:

- **Read‑only treasurer** – Has `financial.ledger.view` but not editing permissions (useful for auditors).
- **Editor without visibility** – Not typical, but possible: a member could have edit permissions but not view (would need UI to hide ledger).
- **Approver only** – Grant `financial.ledger.approve` without other edit permissions.

## Cross‑League Isolation

A user who is a member of League A cannot access data from League B by manipulating resource IDs in API calls. The authorization service enforces tenant isolation by ensuring every permission check is scoped to a specific `leagueId`. The `authorize` function verifies that the requested resource belongs to the same league as the member's membership. For example:

```ts
// In any data‑access layer:
const allowed = await authorize({ userId, leagueId: resourceLeagueId, action: 'view' })
if (!allowed) throw new ForbiddenError()
```

This ensures that even if a user discovers another league's resource ID (e.g., a transaction ID), the authorization layer will reject the request because the user is not a member of that league, or lacks the required permissions within that league.