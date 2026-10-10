# V3 release — current scope

Updated 10 October 2026. AI Co-Founder is a founder evidence workspace with reports,
goals, missions, tasks, decisions, Company Memory, connected intelligence, approvals
and bounded agent workflows. It is not a continuously autonomous company operator.

## Available in the implementation

- Supabase authentication, company ownership checks and PostgreSQL RLS.
- Idea reports with sources, AI estimates and assumptions distinguished; customer
  demand is not independently verified by the report score.
- GitHub OAuth/repository selection, issue sync and deduplicated company events.
- Supabase and Vercel OAuth/project selection and project context.
- Observational insights for recorded blocked/overdue tasks and GitHub issues;
  task and issue insight writes are batched, not one write per item.
- AI investigations retain evidence and failure state. Conclusions are hypotheses,
  not established causes or proof that code was inspected/fixed.
- Prepare/edit/reject/approve supported internal actions and review exact coding
  drafts before GitHub branch/PR creation. No automatic merge/deployment.
- Source-grounded Research, bounded Coding and draft-only Marketing workflows.
  See `AGENT-EXECUTION.md` for provider requirements and execution limits.
- Explicitly enabled internal follow-up automation runs on refresh/sync; no outreach.
- Decision events/memory preserve user versus AI authorship. Old unknown authors
  are not silently converted into verified user or AI attribution.
- Partial company context survives individual query failures and records which
  sections were unavailable.

## Daily brief and Company Pulse

Dashboard reads are read-only. Explicit intelligence Refresh generates a daily
brief only if the current UTC-date snapshot does not exist. A unique
`(company_id, brief_date)` key and ignore-duplicate upsert preserve the first saved
snapshot under concurrent requests. The snapshot stays fixed for that day; task
lists and pulse still reflect current records. Attention reasons use typed signal
constants instead of searching display text for words such as “blocked”.

Pulse measures evidence coverage: completed profile fields, recorded validation
signals/experiments/assumptions and task completion. Growth/revenue remain
unavailable without supported measured sources. Neither pulse nor report scores
represent valuation or probability of business success.

## Product honesty and presentation

The landing page no longer claims trusted customers, permanent free access or a
measured setup time. Its illustrative company preview is labelled Sample. Demo
metrics and sample-company screens are visibly labelled; real companies are not
seeded with demonstration values. Unwired profile/preferences controls are disabled
and labelled Coming soon rather than saved to unused browser settings.

Global CSS is split into ordered feature styles for shared foundations, auth,
landing, reports and company workspace/dashboard. Redundant declarations from the
fixed dark-theme cascade were removed. Import order is intentional; changing it
requires desktop/mobile visual verification.

## Limits and rollout

No payments, autonomous outreach, scheduled agent worker, automatic publishing,
production deployment or database deletion is implemented. Analytics, billing and
other planned connectors must not appear as measured company results. Provider
credit/authentication failures remain real blockers to live coding generation.

Apply all additive migrations in order, including both October hardening migrations,
before deploying these changes. This review does not apply production migrations or
prove the deployed version. Existing deployments/integrations reported working by
the owner are separate from verification of this local patch.

Local acceptance commands: `npm run typecheck`, `npm run lint`,
`npm run test:agents`, `npm run test:v3`, `npm run build`. Authenticated production
acceptance and live model/Sandbox/GitHub side effects need a separate owner-session
check. Tests with mocks or isolated PostgreSQL are explicitly local evidence.
