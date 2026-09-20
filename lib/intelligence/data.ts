import type { SupabaseClient } from '@supabase/supabase-js';
export type V3Record = { id: string; agent_id?: string; permission_level?: string; title?: string; name?: string; description?: string; status?: string; provider?: string; connection_type?: string; severity?: string; confidence?: number | null; recommended_action?: string; conclusion?: string; hypothesis?: string; evidence?: unknown; source_events?: unknown; created_at: string; occurred_at?: string; source?: string; event_type?: string; enabled?: boolean; last_run_at?: string; last_sync_at?: string; metadata?: Record<string, unknown>; input_payload?: Record<string, unknown>; output_payload?: Record<string, unknown>; risk_level?: string; action_type?: string; error_message?: string; approved_at?: string; executed_at?: string; execution_score?: number | null; overall_score?: number | null; product_score?: number | null; validation_score?: number | null; growth_score?: number | null; revenue_score?: number | null; reasoning?: Record<string, unknown> };
export type IntelligenceData = { connections: V3Record[]; events: V3Record[]; insights: V3Record[]; investigations: V3Record[]; actions: V3Record[]; automations: V3Record[]; runs: V3Record[]; syncs: V3Record[]; pulse: V3Record | null; unavailable: boolean };
export async function loadIntelligence(db: SupabaseClient, companyId: string): Promise<IntelligenceData> {
  const tables = ['connections','company_events','company_insights','investigations','ai_actions','automations','automation_runs','connector_sync_logs','company_pulse_snapshots'];
  const results = await Promise.all(tables.map(t => db.from(t).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(t === 'company_pulse_snapshots' ? 1 : 30)));
  const rows = results.map(r => (r.data ?? []) as V3Record[]);
  return { connections: rows[0], events: rows[1], insights: rows[2], investigations: rows[3], actions: rows[4], automations: rows[5], runs: rows[6], syncs: rows[7], pulse: rows[8][0] ?? null, unavailable: results.some(r => !!r.error) };
}
export function executionScore(tasks: { status: string }[]): number | null {
  return tasks.length && tasks.length<1000 ? Math.round(tasks.filter(t => t.status === 'completed').length / tasks.length * 100) : null;
}
export function evidenceText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2);
}
