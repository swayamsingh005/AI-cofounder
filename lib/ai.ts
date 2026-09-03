// Shared AI helpers. Model provider: Groq (OpenAI-compatible chat completions API, generous free tier).
// Web grounding provider: Tavily (LLM-oriented search API, free tier). Neither is Gemini/Google anymore —
// this file replaced @google/genai across the app because the Gemini free-tier quota was too tight for
// the number of calls this app makes per report.
//
// Model selection: set GROQ_MODEL to pin an exact model id (recommended — check current ids at
// https://console.groq.com/docs/models). If unset, groqComplete() tries a short hardcoded candidate
// list in order and moves on when one 404s as "model not found" — a safety net against line-up churn,
// not a substitute for setting GROQ_MODEL explicitly once you know a working id.

export type Source = { title: string; url: string; domain: string };

// If GROQ_MODEL is set, that's the only model tried — trust an explicit choice. If it's not set,
// try this short list in order, moving to the next only on a "model not found"-shaped error (not on
// auth/rate-limit/timeout errors, which trying a different model name won't fix). This is a best-effort
// safety net, not a guarantee — Groq's line-up will keep changing, and console.groq.com/docs/models is
// still the authoritative source. Setting GROQ_MODEL explicitly is the more reliable long-term fix.
const CANDIDATE_MODELS = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "gemma2-9b-it", "llama-3.3-70b-versatile"];

export function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); }
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function callGroq(model: string, apiKey: string, system: string, user: string, opts: { json?: boolean; maxTokens?: number; temperature?: number }): Promise<string> {
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
  if (typeof content !== "string" || !content.trim()) throw new Error(`Groq returned an empty response (model "${model}")`);
  return content;
}

/** Chat completion against Groq. Set json:true to request strict JSON-object output (best-effort — Groq
 * enforces valid JSON syntax in this mode, not an exact schema, so callers must still validate shape). */
export async function groqComplete(system: string, user: string, opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const candidates = process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : CANDIDATE_MODELS;
  let lastError: Error = new Error("No Groq model candidates configured");
  for (const model of candidates) {
    try {
      return await callGroq(model, apiKey, system, user, opts);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isMissingModel = /404|model_not_found|does not exist/i.test(lastError.message);
      if (!isMissingModel || model === candidates[candidates.length - 1]) throw lastError;
      console.error(`[lib/ai] Groq model "${model}" unavailable, trying next candidate`, { message: lastError.message });
    }
  }
  throw lastError;
}

export async function groqJson<T = unknown>(system: string, user: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<T> {
  const raw = await groqComplete(system, user, { ...opts, json: true });
  return JSON.parse(stripJsonFence(raw)) as T;
}

/** Rewrites a short piece of raw user text (a task title, a decision title, etc.) into one clean,
 * grammatically correct sentence — same meaning, same specifics (names, numbers, dates), just
 * polished. Falls back to the original text unchanged if AI isn't configured or the call fails —
 * a failed polish should never block whatever's being created from being created. */
export async function polishOneLine(raw: string, context?: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed || !process.env.GROQ_API_KEY) return trimmed;
  try {
    const system = `Rewrite the given text as one clean, grammatically correct sentence in plain English. Preserve the original meaning and intent exactly, and keep every specific detail (names, numbers, dates, currency) unchanged — do not add information that wasn't there and do not soften or change what it's asking for. Return ONLY the rewritten sentence — no quotes around it, no commentary, no markdown.`;
    const user = context ? `Context: ${context}\n\nText to clean up: ${trimmed}` : `Text to clean up: ${trimmed}`;
    const result = await groqComplete(system, user, { maxTokens: 100, temperature: 0.2 });
    const cleaned = result.trim().replace(/^["'“](.*)["'”]$/, "$1").trim();
    return cleaned || trimmed;
  } catch (error) {
    console.error("[lib/ai] polishOneLine failed, using raw text instead", { message: error instanceof Error ? error.message : "Unknown error" });
    return trimmed;
  }
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
