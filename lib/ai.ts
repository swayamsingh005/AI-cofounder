// Shared AI helpers. Model provider: Groq (OpenAI-compatible chat completions API, generous free tier).
// Web grounding provider: Tavily (LLM-oriented search API, free tier). Neither is Gemini/Google anymore —
// this file replaced @google/genai across the app because the Gemini free-tier quota was too tight for
// the number of calls this app makes per report.
//
// Model name is configurable via GROQ_MODEL because hosted-model line-ups on Groq change over time and
// a stale hardcoded name is the single most common way this silently breaks. Check current model IDs at
// https://console.groq.com/docs/models before assuming the default below still exists.

export type Source = { title: string; url: string; domain: string };

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); }
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/** Chat completion against Groq. Set json:true to request strict JSON-object output (best-effort — Groq
 * enforces valid JSON syntax in this mode, not an exact schema, so callers must still validate shape). */
export async function groqComplete(system: string, user: string, opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: opts.temperature ?? 0.35,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq request failed (${response.status} on model "${model}"): ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq returned an empty response");
  return content;
}

export async function groqJson<T = unknown>(system: string, user: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<T> {
  const raw = await groqComplete(system, user, { ...opts, json: true });
  return JSON.parse(stripJsonFence(raw)) as T;
}

/** Web search via Tavily. Returns a compact text digest for prompting plus structured sources for citations.
 * Returns empty results (never throws) if TAVILY_API_KEY is missing or the request fails, so a missing
 * search key degrades to ungrounded analysis rather than failing the whole report. */
export async function tavilySearch(query: string, maxResults = 6): Promise<{ text: string; sources: Source[] }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { text: "", sources: [] };
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: maxResults, include_answer: false }),
    });
    if (!response.ok) return { text: "", sources: [] };
    const data = await response.json();
    const results: Array<{ title?: string; url?: string; content?: string }> = Array.isArray(data?.results) ? data.results : [];
    const text = results.map(item => `- ${item.title ?? "Untitled"} (${item.url ?? "no url"}): ${(item.content ?? "").slice(0, 500)}`).join("\n");
    const sources: Source[] = results.filter((item): item is { title?: string; url: string; content?: string } => typeof item.url === "string" && item.url.length > 0).map(item => ({ title: item.title ?? "Web source", url: item.url, domain: domainOf(item.url) }));
    return { text, sources };
  } catch {
    return { text: "", sources: [] };
  }
}
