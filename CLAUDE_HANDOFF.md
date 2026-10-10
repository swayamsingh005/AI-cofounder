# AI Co-Founder handoff

Updated 10 October 2026.

Repository: https://github.com/swayamsingh005/AI-cofounder
Public app: https://ai-cofounder-five.vercel.app

## Scope and non-negotiables

Work only in AI Co-Founder. Never touch Sahayak. The owner is preparing a school
ARISE presentation of the current V3 milestone and has deferred adding paid model
credits. Keep product claims limited to implemented, demonstrable behavior. Do not
add payments, autonomous outreach, automatic publishing or production deployment.
Never expose API keys. Source citations and AI estimates are not verified facts.

Stack: Next.js 16 / React 19 / TypeScript App Router, Supabase cookie auth + Postgres
RLS, Groq and Tavily for AI/research, Vercel AI Gateway for coding and
`@vercel/sandbox` for isolated generated-code validation.

## Current capabilities

Reports and a company workspace support profile, goals, missions, tasks, decisions,
memory, conversations, intelligence, approvals and execution history. GitHub,
Supabase and Vercel OAuth/project or repository selection are implemented. The
owner reported Supabase/Vercel connections working; this is not a fresh production
verification. Other planned connectors are not executable integrations.

Research performs source-linked searches and saves grounded findings; Marketing
prepares campaign/post/reel/creative drafts. Coding reads bounded repository
snapshots, prepares up to five files (including empty-repository starters), records
isolated checks, then exposes the exact change for approval before GitHub PR
creation. Provider credits are still required for live coding. No local test proves
that an unpaid model request or remote sandbox will succeed.

See `docs/AGENT-EXECUTION.md` for limits, permission policies, configuration names,
recovery behavior and authenticated acceptance steps.

## October review changes

1. Recovery explicitly uses skip-locked rows; missing agent references cascade on
   parent deletion without bypassing direct audit-deletion guards.
2. Additive decision-authorship migration preserves user versus AI provenance;
   historical unknown authors stay unknown.
3. Tavily has a 10-second abort timeout with empty-results fallback.
4. CEO software fallback requires software terms and preserves a validated false.
5. Company context returns surviving sections and marks failed ones unavailable.
6. Daily reads do not write; explicit refresh stores one snapshot per UTC day;
   signal classification uses constants rather than display-string matching.
7. Intelligence refresh/sync batch item writes.
8. Unsupported landing trust/setup/permanent-free claims are removed.
9. Sample metrics are labelled and missing live values remain unavailable.
10. Unwired settings are disabled with Coming soon.
11. Feature CSS preserves cascade order, is formatted and removes redundant fixed
    dark-theme declarations; compare desktop/mobile visuals when changing imports.
12. Release/execution/handoff docs now describe current capabilities and boundaries.

Historical migration files are untouched. New files to apply in order:
`20261010102228_harden_agent_recovery_and_cascades.sql` and
`20261010102405_preserve_company_change_authorship.sql`.
They are tested against isolated PGlite, not applied to production by this review.

## Verification and next work

Run `npm run typecheck`, `npm run lint`, `npm run test:agents`, `npm run test:v3`
and `npm run build`. Agent regressions include partial failures, timeouts, daily
idempotency, batching, ownership, approval/rollback and cascade/recovery behavior.
Lint's cache/deployment-output exclusions are intentional; the CommonJS exception
is scoped to the existing `.cjs` test runners, not application code.

Before claiming production readiness, apply migrations and verify signed-in flows.
Before claiming a coding build works end-to-end, use available model credits,
inspect saved validation, approve a focused PR, and inspect checks/preview. Do not
claim a local stub, generated task or OAuth connection is a deployed website.
