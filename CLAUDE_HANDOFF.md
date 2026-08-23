# AI Co-Founder - Claude Handoff

## What this product is

AI Co-Founder is a new, standalone startup-validation web app. It must remain completely separate from the user's older Sahayak project.

Current public app: https://ai-cofounder-five.vercel.app

GitHub repository: https://github.com/swayamsingh005/AI-cofounder

The product began as an idea-to-report tool. The owner is now correctly concerned that a generic AI report is not worth paying for. The product should evolve toward an evidence-based founder validation workspace, not a ChatGPT-style report generator.

## Critical product direction

Do not position a one-shot AI report as premium research.

The direction agreed with the owner is:

> AI Co-Founder helps founders collect proof before they waste months building.

The paid product should eventually be a **Validation Sprint**:

1. Founder enters a business idea and context.
2. App creates a 7-day validation mission.
3. Founder stores customer interviews, outreach replies, landing-page results, and pilot commitments.
4. AI identifies repeated pain points, objections, and buying signals.
5. The build / test / avoid verdict changes based on visible evidence.

The existing static report should be treated as free triage or a starting hypothesis, not final market research.

## Stack

- Next.js 16.3.2, App Router, TypeScript
- React 19
- CSS-only styling in `app/globals.css` (no Tailwind)
- Supabase Auth + Postgres + Row Level Security
- Gemini via `@google/genai` 2.18.0
- Vercel production deployment connected to the GitHub `main` branch

## Local project location

`C:\Users\swaya\Documents\Codex\2026-08-21\ai-co-founder-new-application-build\ai-cofounder`

Run locally:

```powershell
cd C:\Users\swaya\Documents\Codex\2026-08-21\ai-co-founder-new-application-build\ai-cofounder
npm run dev
```

If Next says another dev server is running, stop the old process rather than deleting `.next` blindly.

## Environment variables - never commit values

Local `.env.local` and Vercel Production + Preview must have:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
GEMINI_API_KEY=...
```

The user's Gemini key begins with `AQ...`. This is a valid current Google AI Studio authorization key. Do not tell the user it must begin with `AIza`.

Vercel also has a `VERCEL_OIDC_TOKEN`; leave it alone.

## Authentication

- Email/password sign-in and Google OAuth are implemented.
- Supabase Google OAuth works when Supabase redirect configuration includes the production callback:
  `https://ai-cofounder-five.vercel.app/auth/callback`
- Relevant files:
  - `app/auth/page.tsx`
  - `app/auth/callback/route.ts`
  - `lib/supabase/client.ts`
  - `lib/supabase/server.ts`
  - `lib/supabase/proxy.ts`

`hasSupabaseConfig()` validates the URL to avoid an invalid environment variable crashing the site. Preserve that safeguard.

## Database

### V1 reports

The initial required schema is in:

`supabase/schema.sql`

It creates `public.reports` with fields:

- `id`
- `user_id`
- `idea`
- `title`
- `verdict`
- `score`
- `report` JSONB
- `created_at`

It has user ownership RLS policies.

### V2 evidence workspace tables

The next schema is in:

`supabase/v2-schema.sql`

It creates:

- `public.founder_memories`
- `public.competitors`
- `public.customer_toolkits`

Each table uses user ownership (`user_id`) and RLS. The user said they pasted this SQL into Supabase, but it has not been independently confirmed that they clicked **Run** or that it succeeded. Verify in Supabase SQL Editor / Table Editor before relying on it.

Do not weaken RLS. Each user must only access their own rows. When adding tables, enable RLS, explicitly limit grants, and use policies matching:

```sql
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id)
```

## Pages and current features

### `/`

Home / marketing page. It has an animated co-founder scene and idea input. Submitting sends the user to `/workspace?idea=...`.

Relevant file: `app/page.tsx`

### `/workspace`

Animated research progress screen. It calls `/api/analyze` and opens the saved report if user is signed in. Current agent labels:

- Market intelligence
- Customer reality
- Competitive terrain
- Business model
- Risk review
- MVP & execution

Relevant file: `app/workspace/page.tsx`

### `/report/[id]`

Decision report, including the special static demo report at `/report/demo`.

Current visual elements:

- business score and verdict
- six named agents: Mira, Asha, Theo, Owen, Rhea, Nova
- directional scorecard bars
- decision gate / assumptions
- evidence required to change verdict
- market, customer, competition, business model, MVP, risks, execution plan
- print/download button (`window.print()`)
- 7-day plan modal

Relevant files:

- `app/report/[id]/page.tsx`
- `components/report-actions.tsx`
- CSS in `app/globals.css`

### `/reports`

Private saved reports list from Supabase.

### `/v2`

Initial evidence workspace. It includes:

- Founder Memory: save notes as insight / interview / experiment / decision
- Competitor Board: manually save competitor information and timestamp it
- First Customer Toolkit: Gemini drafts email, LinkedIn and call prompts; it does **not** send outbound messages

Important: competitor monitoring is currently a manual board, not automated live monitoring. Do not market it as live monitoring.

Relevant files:

- `app/v2/page.tsx`
- `app/api/customer-toolkit/route.ts`
- `supabase/v2-schema.sql`

### `/pricing`

Presentation-only pricing page. There is no payment or subscription flow. Buttons route the user to start an idea. Do not claim payments are implemented.

### `/settings`

Stores founder name, market, and research depth only in browser localStorage. It is not yet persisted to Supabase.

## AI implementation and current issue

### Current report route

File: `app/api/analyze/route.ts`

It uses two stages:

1. Gemini `googleSearch` grounding for current web research.
2. Gemini structured JSON analysis based on the grounded text.

The report JSON now includes `scorecard`:

```ts
{
  market: number,
  pain: number,
  differentiation: number,
  economics: number,
  execution: number
}
```

The UI labels this as a directional AI estimate, not verified information.

### Grounded research status

This has been coded and deployed in commit `f61f7cb`, but the first production test received Gemini error 429:

`RESOURCE_EXHAUSTED: You exceeded your current quota`

Therefore new reports currently fall back to the generic fallback report until the Gemini quota resets or billing is enabled.

Do not claim web grounding works until you run a new report successfully and confirm:

- `generatedBy` is `gemini`, not `fallback`
- `sources` contains real URLs
- report contains specific sourced context

The implementation uses `gemini-3.5-flash-lite`, because Google previously rejected `gemini-2.5-flash-lite` for this project as unavailable to new users.

### Source / quality rules

- Do not call AI guesses “verified.”
- Do not invent named competitors, market sizes, prices, or citations.
- If grounded research returns no source, say so clearly.
- A precise 0-100 score without visible evidence is fake precision. Long term, replace score-only logic with transparent evidence inputs.

### Recommended next AI work

1. Add a proper multi-field intake before analysis: customer, geography, business model, existing alternatives, founder constraints, and desired outcome. One raw sentence cannot produce a specific report.
2. Store grounded URLs with title and domain in structured data, not one plain source string.
3. Render clickable citations next to the exact claims they support.
4. Add citations / claims classification: verified, estimate, assumption.
5. Add user-supplied evidence (interview notes, waitlist/pilot results) and recompute the decision based on it.
6. Consider a paid report mode only after API cost, grounding quota, and evidence quality are understood.

## Report quality requirements

The user is dissatisfied with generic reports. Do not solve this only with more gradients or decorative graphs.

High-quality report requirements:

- specific to the founder's customer and geography
- named current alternatives with cited URLs when grounded research supports them
- a distinct thesis, not generic “interview 10 people” advice
- risks specific to the concept (technical, legal, acquisition, trust, economics)
- a testable hypothesis for each major assumption
- concrete pilot / outreach / pricing test design
- visible evidence standard: what will count as a pass, fail, or pivot
- graphics should communicate data; do not add fake charts
- the printable report needs an actual report cover, page numbers, source appendix, section page breaks, and clean white background

## Visual system

The current app uses a dark sapphire / violet / cyan visual system. The report page is the strongest visual page and should remain the reference style.

Dark mode is default in `app/layout.tsx` using:

```tsx
<html lang="en" data-theme="dark">
```

`components/theme-toggle.tsx` lets users select light mode and saves choice in localStorage.

CSS is mostly one long global file: `app/globals.css`. Be careful editing it. Prefer appending focused styles or gradually extracting component CSS rather than breaking existing selectors.

## Important commits / history

- `f2b79ac` Add founder evidence workspace
- `11b9ad7` Upgrade decision report content and print layout
- `f61f7cb` Ground reports in current web research

Worktree was clean after the last successful commit.

## How to verify changes

```powershell
npm run build
git status --short
```

For live reports after deployment, create a new signed-in report. Old stored reports retain the report JSON generated at the time they were created; they do not regenerate automatically.

For deployment, pushing to `main` triggers Vercel. The stable URL is:

`https://ai-cofounder-five.vercel.app`

## Current user priority

The owner wants the report to become much more specific, premium, helpful, and graphically meaningful. They are moving to Claude because they want an agent to continue building it.

The right next task is not more generic features. It is:

> Rebuild the report generation workflow around richer founder intake + grounded current research + structured citations + founder-collected evidence.

Do not modify Sahayak. Do not expose API keys. Do not add payments, autonomous outreach, financial transactions, or enterprise features without explicit request.
