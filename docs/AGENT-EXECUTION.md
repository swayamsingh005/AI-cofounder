# Three-agent execution foundation

Implemented locally on 19 September 2026, extending baseline commit 4c802fc.
Not deployed. The production Supabase project reports INACTIVE, so live schema
inspection, migration application and signed-in acceptance testing are pending.

## Existing systems preserved

Next.js App Router, React, TypeScript, Supabase cookie authentication, Groq,
reports, workspace profiles/goals, missions, tasks, Company Memory, conversations,
daily briefs, recommendations, connected intelligence and the existing dashboard.
GitHub OAuth, encrypted credential storage and issue syncing are reused unchanged.
Existing ai_actions, internal execution, approvals, activity_events and memories
remain the authoritative records. No second approval or memory system was added.

## Company Pulse correction

The live dashboard no longer hardcodes the Pulse ring and four dimensions as blank.
It calculates an evidence-coverage Pulse from current company records on every page
load and stores the same calculation when intelligence is refreshed:

- Product definition: percentage of six core profile fields completed.
- Market validation: recorded customer signals (up to 50 points), experiments
  (up to 25) and supported/rejected assumptions (up to 25).
- Execution: completed tasks divided by all company tasks.
- Growth and revenue: unavailable until supported analytics/billing data exists.

The overall number averages only available dimensions and displays coverage such as
“3/5 signals.” Its explanation shows the source counts and next step for every
dimension. It is explicitly labelled as evidence coverage, not business health,
valuation or probability of success.

## How it works

In the existing company conversation, select **Run agents**. Advice mode is unchanged.
The deterministic bounded planner selects research, coding and/or marketing based
on the objective. Unsupported objectives are rejected with guidance. This first
version is not a general natural-language planner; routing is English keyword-based.
Research precedes coding and marketing when selected. Dependencies carry validated
structured outputs, not hidden inter-agent conversations.

One existing mission and its analysis tasks are created transactionally, along with
agent_runs. Agent identity comes from the validated server plan, never model output.
The execution layer checks the registry policy and sends only selected company
context/evidence to the existing model helper. No model gets credentials, a database
client, shell access or an arbitrary API tool.

Analysis actions are AUTO and use ai_actions. The result is validated, then a single
database transaction stores the result, Company Memory provenance, task completion,
activity and any proposed follow-up actions. Follow-up create_task actions use the
existing approval centre: edit, approve or reject. Approved tasks attach to the
existing mission. A run may finish its analysis but wait for approval of follow-ups;
dependent analysis can use its saved output during that wait.

## Actual capabilities

| Agent | Implemented | Not implemented |
|---|---|---|
| Coding | Saved GitHub issue analysis, technical recommendations, implementation plans, proposed tasks | Source-code reading, code edits, branches/PRs, merges, deployments |
| Research | Internal evidence synthesis, structured observations/hypotheses, research plans, unknowns | Live web search in agent workflows, independently verified competitor facts |
| Marketing | Campaign plans, positioning, copy drafts, creative briefs, proposed tasks | Publishing, outbound messages, generated images/video, external campaigns |

The existing report search functionality has not been wired into the Research Agent.
Model-generated observations cite supplied record IDs, but citations alone do not
verify the interpretation. Memory is labelled AI analysis, not independently verified
knowledge. Full drafts and findings remain accessible in run outputs.

## Registries and permissions

- lib/agents/registry.ts: exactly three agents; roles, capabilities, connector/action
  allowlists, version and status; action policy is backend-owned.
- lib/connectors/registry.ts: eleven planned connectors. Only saved GitHub issue
  reading is available. Public repository reading is labelled Public read only,
  not authenticated Connected. Existing PostHog/Stripe placeholders remain visible.
- lib/agents/schema.ts: strict validation rejects extra fields, impersonation,
  permission overrides, unsupported actions, invalid references and oversized output.
- lib/agents/execution.ts: bounded model analysis and recognizable-credential redaction.
  Provider credential tables are never queried for agent prompts.
- Future external actions have non-executable policies; restricted transfers and
  destructive database actions cannot execute.

## Database changes

Migration: supabase/migrations/20260919122549_agent_execution_foundation.sql

- New agent_runs table: company/user, request key, step, agent, objective, founder
  goal, mission/task, action type, dependencies, status, result, error, usage and times.
- missions and tasks: composite unique(company_id,id) constraints.
- ai_actions: agent_run_id, agent_id, permission_level; company-scoped run reference.
- memories: source_agent, source_run_id, source_action_id; company-scoped references.
- activity_events: agent_run_id with company-scoped reference.
- agent_runs RLS permits authenticated owner reads only. Writes and workflow RPC
  execution are service-role-only. No new credentials are exposed to the browser.
- guard_agent_records trigger on existing actions, memory and activity prevents
  browser impersonation, policy changes, result alteration and agent audit deletion.
- agent_workflow RPC implements start/claim/finish/fail/recover with ownership checks,
  advisory locking, atomic writes, dependency gating and request deduplication.
- Existing execute_internal_action is retained as execute_internal_action_v2, with
  direct client access revoked. A wrapper keeps the existing public signature and
  adds explicit founder ownership, policy and provenance checks before executing it.
  The wrapper is SECURITY DEFINER to write protected agent provenance; it has a fixed
  empty search path, explicit auth.uid ownership checks and no anonymous/PUBLIC grant.
- settle_agent_approval trigger updates run state when follow-ups resolve.
- Existing ownership policies and GitHub credential schema are preserved.

The migration was applied to an isolated PGlite PostgreSQL database with simulated
Supabase auth roles for tests. It has NOT been applied to production. Local tests
are not a substitute for checking the actual live schema and Supabase advisors.

## API and interface

No separate chat or approval API was added.

- POST /api/company/ask accepts mode=agents, a UUID requestKey and an objective up
  to 500 characters; returns answer, runs and missionId. Existing advice mode remains.
- POST /api/company/intelligence adds agent_status to recover interrupted runs.
- /company/[id]/agents extends the existing section route; displays actual run state,
  outputs, errors, capability/tool availability and a status refresh control.
- Existing navigation/command bar link to Agents; approvals/history show agent context.
- /demo/v3?section=agents shows idle registry cards, explicitly without live execution.

## Configuration and execution limits

Existing server-only GROQ_API_KEY and SUPABASE_SERVICE_ROLE_KEY are required, along
with the existing Supabase public configuration. Pin GROQ_MODEL to a supported model.
The local environment currently has no SUPABASE_SERVICE_ROLE_KEY; execution reports
setup required rather than claiming success.

Optional server environment variables:

| Setting | Default | Allowed |
|---|---:|---|
| AGENT_MAX_STEPS | 3 | 1–3 |
| AGENT_MAX_ACTIONS | 2 | 0–2 proposed tasks per agent |
| AGENT_TIMEOUT_MS | 12000 | 1000–15000 per model request |
| AGENT_MAX_OUTPUT_TOKENS | 1400 | 100–2000 |

No recursive execution or automatic retries. At most three model calls per workflow,
one active workflow per company, and 20 workflow starts per company per hour.
Input/output size caps and usage metadata support later cost accounting. Token counts
and dollar costs are not estimated as if they were actual provider billing.

Execution runs on the server during a short request, not in a React component. Runs
older than two minutes still queued/running are marked failed/cancelled when a founder
refreshes status or starts a new workflow. There is no scheduled worker or guaranteed
survival of a process crash/client disconnect. A durable queue, worker leases, heartbeat,
retry policy, cancellation and scheduled recovery are the later infrastructure step.

## Verification

- TypeScript and production build: pass.
- Four requested routing/analysis workflows: pass with deterministic model stubs.
  Includes research-to-marketing structured dependency transfer and three-agent launch routing.
- Strict output validation and forbidden-action tests: pass.
- Existing GitHub connector suite: pass, using its existing network stubs.
- Every existing schema/migration plus new migration applies in isolated PostgreSQL.
- Existing V3 SQL regression tests: pass unchanged.
- New database tests: dependencies, idempotency, single claim, duplicate completion,
  edit/approve/reject, failed-output atomic rollback, no result on failure, stale recovery,
  cross-user reads, cross-company references, protected provenance/audit rows: pass.
- API checks on local production build: unsigned request 401, cross-origin 403,
  malformed JSON 400.
- Browser: three agent cards, planned connectors and existing demo approvals render;
  demo approval remains explicitly simulated; no browser errors; no horizontal
  overflow at 1262px.
- Targeted lint for new/changed agent code: no errors. Full repository lint reports
  14 errors and 14 warnings in pre-existing code under the newly functioning lint
  configuration. No rules/tests were disabled.
- Live model quality, authenticated browser workflows, real OAuth and production
  database access have NOT been validated in this phase.

## Existing issues found

The old lint command used next lint, which the current Next.js release does not
provide. It now invokes ESLint. Existing findings remain in auth/home/settings/
workspace navigation, settings/V2/GitHub/local-time effects, tilt ref handling and
the older CommonJS connector tests.

The package audit flags existing Next.js 16.3.2 (critical) and transitive sharp (high).
This phase did not upgrade the framework or suppress these findings. Plan and test
the patch upgrade before production release.

## Next step

Restore/access the existing Supabase project, verify live migration history, configure
the server credential securely, apply this additive migration, and run signed-in
acceptance tests for all four workflows with the real model. Address existing lint
and dependency findings before release. Do not add further integrations until that
acceptance pass succeeds.

## File inventory

Created:

- lib/agents/registry.ts
- lib/agents/schema.ts
- lib/agents/planner.ts
- lib/agents/execution.ts
- lib/agents/runtime.ts
- lib/connectors/registry.ts
- components/agents-panel.tsx
- components/agent-status-refresh.tsx
- supabase/migrations/20260919122549_agent_execution_foundation.sql
- tests/agents.mjs
- tests/agents-db.mjs
- eslint.config.mjs
- docs/AGENT-EXECUTION.md

Modified:

- app/api/company/ask/route.ts
- app/api/company/intelligence/route.ts
- app/company/[id]/[section]/page.tsx
- app/demo/v3/page.tsx
- components/ask-cofounder.tsx
- components/command-bar.tsx
- components/company-sidebar.tsx
- components/v3-dashboard.tsx
- components/v3-module.tsx
- lib/ai.ts
- lib/company-context.ts
- lib/connectors/base.ts
- lib/intelligence/data.ts
- package.json and package-lock.json
- .gitignore

No production data, credentials, deployed code, GitHub repository contents or
external accounts were modified. Changes remain in the existing local checkout;
they have not been committed or pushed.
