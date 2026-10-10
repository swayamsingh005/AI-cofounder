# Agent execution — current implementation

Updated 10 October 2026. This describes the checked-in implementation and local
verification, not proof that production has received the latest migrations.

## Supported workflows

AI Co-Founder uses Next.js App Router, React, TypeScript and Supabase cookie auth.
A company owner can request a bounded workflow through `/api/company/ask`, or
prepare a focused software build through the Approval centre. CEO assignments use
a validated `needsSoftware` boolean; fallback routing requires explicit software
terms and does not infer software from general business verbs.

| Agent | Implemented | Boundary |
|---|---|---|
| Research | Tavily search, source-linked findings, internal evidence synthesis and saved Company Memory | Source citations do not independently verify an AI interpretation; unavailable search fails honestly |
| Coding | Bounded repository snapshots, up to five replacement/new files, empty-repository starters, isolated validation, approved GitHub branches and pull requests | No automatic merge or production deployment; requires provider access and available model credits |
| Marketing | Campaign plans, post drafts, reel scripts, shot guidance and creative briefs | No publishing, autonomous outreach or finished-media generation |

GitHub OAuth supports repository selection and authenticated reads/writes within
its granted scopes. Supabase and Vercel OAuth support selecting connected projects
and reading project context. A connected account alone does not grant an agent an
executable database-modification or production-deployment action. VS Code and other
registry connectors are plans/capability descriptions, not implemented connections.

## Execution and approval

`lib/agents/registry.ts` owns action permissions. Model output cannot change them.
`schema.ts` validates output shape, bounds and evidence references. `runtime.ts`
checks company ownership again before service-role RPC operations. Provider secrets
stay server-side; connector credentials use encrypted storage, not public metadata.

The workflow RPC atomically creates runs, claims work, records validated results,
updates linked tasks and stores provenance in existing actions, memory and activity.
Request keys deduplicate workflows. Structured dependency results are passed between
selected agents. Analysis and drafting do not mean that external work has completed.

Coding drafts are validated in `@vercel/sandbox`, then saved for founder review.
The sandbox is nonpersistent, has two virtual CPUs and a 150-second timeout. It
installs dependencies using the repository lockfile where available, then runs
available typecheck, test and build scripts. Failure/unavailability is recorded;
there is no claim of successful validation without passed checks. The exact files
and validation results are reviewable before approved branch/PR creation. GitHub
checks and preview deployment status can be refreshed afterward.

## Limits and failure handling

The planner allows at most three steps, defaults to two proposed internal tasks per
agent and caps those values at three/two. Analysis defaults to 1,400 output tokens
(maximum 2,000) and a 12-second model timeout (configurable 1–15 seconds). Coding in
agent workflows allows 12,000 output tokens and a 90-second model timeout. These
are configured bounds, not measured billing. Tavily search aborts after 10 seconds
and returns empty results on HTTP, transport or timeout failure.

One active workflow per company and hourly workflow limits are enforced in SQL.
There is no durable background worker or scheduled recovery. Queued/running work
older than the SQL recovery cutoff (two minutes from creation) is recovered on a
status refresh/new workflow. Recovery uses advisory locking plus row locking with
`FOR UPDATE SKIP LOCKED`. This cutoff is an operational limit for long workflows;
local locking tests do not prove distributed-worker behavior.

## Schema and provenance

Historical migrations remain immutable. Apply all migrations in timestamp order.
The execution foundation is `20260920035705_agent_execution_foundation.sql`.

The October hardening migrations are:

- `20261010102228_harden_agent_recovery_and_cascades.sql`: explicit skip-locked
  recovery and cascading references for agent audit records. Audit guards continue
  to prevent direct deletion of protected agent records while allowing deletion
  through a deleted parent company.
- `20261010102405_preserve_company_change_authorship.sql`: new user decisions
  default to user authorship; the internal AI executor explicitly writes AI
  authorship. Event payloads and derived memory preserve that author. Historical
  decisions without reliable attribution remain unknown rather than relabelled.

Run references are company-scoped; RLS limits owner reads and privileged workflow
writes. Service-role configuration must never be exposed to the browser.

## Configuration

Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Server only: `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`,
`CONNECTOR_ENCRYPTION_KEY`, provider OAuth client IDs/secrets and Vercel Gateway /
Sandbox authentication. `CODING_MODEL`, `CODING_FALLBACK_MODELS`, `GROQ_MODEL` and
`AGENT_*` limits select runtime behavior. Do not copy secret values into docs,
logs, screenshots, model prompts or browser props. No payment flow is implemented.

## Verification and acceptance

Run `npm run typecheck`, `npm run lint`, `npm run test:agents` and `npm run test:v3`.
Agent tests include schema/policy/routing checks and isolated PGlite migrations,
ownership, deduplication, approval, rollback, recovery and company-deletion checks.
Focused regressions cover Tavily aborts, partial context, read-only/daily brief
persistence and constant-query batching. Browser checks cover public/sample routes;
sample data never populates a real company.

Production acceptance still requires applying the new migrations and an owner
session: connect/select a repository, prepare a focused change, inspect validation,
approve its PR and inspect repository checks/preview. Paid provider execution is
not established by local stubs or by successful OAuth connection.
