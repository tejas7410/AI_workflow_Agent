# AI Agent Workflow Builder

A secure, multi-tenant AI workflow platform inspired by the core workflow
execution concepts of tools such as n8n.

## Project Status

Early development — Project Setup phase.

## Technology Stack

- Nhost
- Hasura GraphQL Engine
- PostgreSQL
- GraphQL
- Next.js / React
- Hasura Actions
- LLM API
- Git / GitHub
- Vercel

## Architecture

The application is designed around the following flow:

Next.js / React
|
| GraphQL
v
Hasura GraphQL Engine
|
+---- PostgreSQL
|
+---- Hasura Actions
|
v
Workflow Execution

Workflow execution is server-side.

The frontend must not directly perform privileged workflow execution.

## Core Concepts

The application will support:

- Organizations
- Organization memberships
- Owner / Editor / Viewer roles
- Workflows
- Ordered workflow steps
- Workflow triggers
- Workflow runs
- Step runs
- Approval gates
- Live execution updates
- Quota enforcement

## Required Workflow Steps

- `llm_call`
- `http_request`
- `db_write`
- `notify`
- `conditional_branch`
- `approval_gate`

## Required Trigger Types

- `manual`
- `webhook`
- `scheduled`
- `database_event`

## Security Model

Authorization will use two layers:

1. Organization membership and role authorization.
2. Step-level authorization for privileged operations.

Organization-owned resources must be protected by organization membership
and role checks.

Knowing a resource ID must never grant access.

Secrets must remain server-side.

## Repository Structure

```text
ai-workflow-builder/
├── frontend/
├── backend/
├── hasura/
│   ├── migrations/
│   └── metadata/
├── README.md
├── .env.example
└── .gitignore
```
