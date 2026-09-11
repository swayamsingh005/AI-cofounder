# V3 Phase 1: connected intelligence

## Architecture and preserved V2

The app remains Next.js App Router / React / TypeScript, with Supabase cookie authentication, company-owned PostgreSQL records and the existing Groq completion helper. Reports, company creation, missions, tasks, decisions, memory, chat and command bar remain in place. The original dashboard is at `/company/[id]/overview`; the company root now renders the V3 dashboard.

Existing tables: reports, companies, company_profiles, goals, missions, milestones, tasks, decisions, memories, conversations, messages, activity_events and daily_briefs. Earlier report/evidence tables are untouched.

Additive migrations under `supabase/migrations` create connections, company_events, company_pulse_snapshots, company_insights, investigations, ai_actions, automations, automation_runs and connector_sync_logs. All have company ownership RLS and no anonymous grants. New cross-record references use company/id composite foreign keys where applicable. Internal task updates independently verify the target company inside the transactional executor.

## Available now

- Reference-inspired V3 dashboard and a clearly labelled `/demo/v3` presentation workspace.
- Public GitHub repository reading: issue snapshot (up to 30 recently updated issue/PR records, PRs excluded), open issue search count, explicit sync, disconnect, rate-limit/timeout states and sync history.
- Event deduplication and links to the original GitHub issue. Source text is untrusted.
- Deterministic insights for blocked/overdue tasks and observed open GitHub issues. These are observations, not calibrated causal diagnoses.
- AI investigations using company context, tasks, memories and recent events, with persisted evidence, failure status and retry after interrupted requests.
- Approval centre: prepare, edit, reject and execute supported internal actions. Create task, create mission, record decision, add learning and API-supported task-status updates.
- Row-locked, transactional execution: repeated approval returns the original result; failure rolls back record effects; outcomes enter memory and activity.
- Owner-enabled follow-up-task automation. Runs when intelligence refreshes or GitHub syncs, once per insight. It never executes a cancelled action.
- V2 task completions, new decisions and customer-signal memories enter the company event stream. Task completions and decisions also update memory.
- Daily Brief reads pending approvals, high-severity insights and recent completions. Chat includes connected evidence and must not claim unsupported tool execution.
- Assumption evidence statuses and execution-result/customer-signal memory categories.

## Explicit limits — not full autonomous V3

- PostHog, Stripe and Notion are setup-gated; OAuth/private GitHub and all external write capabilities remain unimplemented.
- No background scheduler, webhooks, production deployments, code generation/PR execution, refunds or outgoing messages. There is no claim of continuously running agents.
- No credentials are collected for the public connector. Future OAuth needs a separate encrypted, server-only credential store (not connection metadata), key rotation and scope/revocation handling.
- Live revenue, users, conversion and customer counts stay empty until integrations exist. GitHub counts are search-index snapshots, not real-time guarantees.
- Company Pulse only derives task-completion percentage; other subscores and overall health remain unavailable. At the 1,000-row read cap even the execution score is withheld. It is not a business-success score.
- Schedule, threshold and broader event automation schemas are extensible, but only refresh-triggered internal task creation is enabled.
- Investigations are model hypotheses; they do not inspect source code or establish causality. Human validation and business-impact measurement remain necessary.
- Lists show recent 30 records; connector sync is a bounded snapshot, not a complete historical import.

## Environment

Uses existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the existing project client's key setting) and `GROQ_API_KEY`; optional existing `GROQ_MODEL`. No new production secret or package dependency is needed. Do not place tokens in metadata or browser props. Never use a service-role key in the browser.

## Verification

- Production build and TypeScript checks pass.
- `tests/v3-connectors.cjs`: fixed-origin URL validation, no auth header leakage, PR filtering, deterministic identifiers, timeout/404/rate-limit handling and honest pulse calculation. A live read of `octocat/Hello-World` passed.
- `tests/v3-security.sql`: all fixture writes roll back. Tests approval gating, idempotency, forbidden external action, event and automation dedupe, execution memory, cross-user reads/writes, every internal action type, failed-action rollback and V2 task event bridge.
- Browser: demo dashboard and approval screen rendered, approval simulation stayed local, no console errors or horizontal overflow at tested desktop width.
- Authenticated browser regression and full report-generation flow require a signed-in session and have not been claimed as tested. No real company was populated with demo data.

## Rollout / next stage

Apply migrations in order before deploying the code. Keep migrations additive; reverting the UI does not require dropping any data. Next stage: authenticated acceptance testing, private GitHub OAuth, one analytics integration, a real scheduled runner with leases/retries and business-outcome measurement.
