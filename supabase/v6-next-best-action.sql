-- Adds structured Next Best Action storage to the daily brief, separate from the general
-- attention_items list — the Overview redesign splits these into two distinct UI elements
-- (one headline action + a shorter "everything else" list) instead of the AI's priority
-- sentence just restating whatever the first attention item already said.
alter table public.daily_briefs add column if not exists next_best_action jsonb;
