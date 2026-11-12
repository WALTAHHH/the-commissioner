# Permission Model

RBAC with granular member-level overrides.

## Model

- Users
- Leagues
- League memberships
- Roles (Commissioner, Co-commissioner, Treasurer, Rules Admin, Historian, Member, Guest)
- Permissions (categorized by domain)
- Role-permission assignments
- Member-specific overrides

## Principles

- Deny by default
- Backend enforces permissions independently of frontend visibility
- Roles are league-scoped (not global)
- Financial visibility is independently configurable from financial editing rights
- Agent connections can never exceed the authority of the user who created them

## Permission Categories

- League administration
- Membership
- Rules and governance
- Financial records
- Communications
- Historical records
- AI and integrations
