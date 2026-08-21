# AI Co-Founder

A focused startup intelligence product: idea → structured research → a candid build/test/avoid verdict → an execution plan.

## Run locally

```bash
npm install
npm run dev
```

The app works in demonstration mode without credentials. Add an AI provider and Supabase credentials from `.env.example` to move from demo reports to production generation and saved reports.

## Solo-founder-friendly stack

- Next.js App Router + TypeScript
- Server route for report orchestration (`app/api/analyze/route.ts`)
- Supabase Auth + Postgres for user accounts and saved reports (schema in `supabase/schema.sql`)
- Deploy to Vercel; add environment variables in the project settings

The route is deliberately designed to return transparent estimates and assumptions when it cannot validate live research. A production research worker should retrieve and store source URLs before asking the model to synthesize a report.
