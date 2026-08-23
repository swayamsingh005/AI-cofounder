import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import ReportActions from "../../../components/report-actions";
import RecomputeAction from "../../../components/recompute-action";
import Tilt from "../../../components/tilt";

type Confidence = "verified" | "estimate" | "assumption";
type Source = { title: string; url: string; domain: string };
type Evidence = { market?: Confidence; customer?: Confidence; competitors?: Confidence; businessModel?: Confidence };
type ReportContent = {
  scorecard?: { market?: number; pain?: number; differentiation?: number; economics?: number; execution?: number };
  summary?: string; market?: string; customer?: string; problem?: string; competitors?: string; gap?: string; businessModel?: string; pricing?: string;
  risks?: string[]; mvp?: string[]; avoid?: string[]; firstCustomers?: string[]; plan7?: string[]; plan30?: string[]; assumptions?: string[];
  sources?: Source[]; evidence?: Evidence; nextMove?: { headline?: string; detail?: string }; generatedBy?: "gemini" | "fallback";
  intake?: { customer?: string; geography?: string; businessModel?: string; alternatives?: string; constraints?: string; outcome?: string };
  evidenceApplied?: boolean; evidenceRecomputedAt?: string; evidenceCount?: number; evidenceSummary?: string; evidenceReasoning?: string; repeatedSignals?: string[]; priorScore?: number; priorVerdict?: string;
};
type StoredReport = { id?: string; title: string; verdict: string; score: number; report: ReportContent; created_at: string };
type Memory = { id: string; kind: string; title: string; content: string; created_at: string };

const demo: StoredReport = { title: "Local service growth copilot", verdict: "TEST FIRST", score: 74, created_at: new Date().toISOString(), report: { summary: "A focused growth assistant for independent home-service businesses has a credible wedge: owners need more predictable enquiries but lack the time and specialist support to run marketing systems.", market: "AI estimate: independent home-service operators are a reachable niche with recurring lead-generation pressure.", customer: "Owner-operators who manage jobs and marketing themselves.", problem: "Owners lose leads because follow-up, review collection and local visibility are inconsistent.", competitors: "Broad marketing suites, agencies and manual spreadsheet-based follow-up.", gap: "Existing tools are broad marketing suites or disconnected AI writers.", businessModel: "A subscription with an assisted onboarding pilot can test willingness to pay.", pricing: "Assumption: validate a monthly price with five founder interviews before setting a rate.", risks: ["Weak repeat usage after the first marketing plan", "Generic AI tools may feel sufficient"], mvp: ["Weekly growth plan built from a business profile", "Lead follow-up sequences for email and SMS", "Review request and local-content generator", "A simple results dashboard"], avoid: ["Broad platform features", "Premature automation"], firstCustomers: ["Interview 10 operators", "Offer a concierge pilot", "Ask for a paid commitment"], plan7: ["Write a narrow owner-operator hypothesis", "Book five customer conversations", "Document current workarounds", "Create a simple offer page", "Show the prototype to interviewees", "Ask for a paid pilot", "Decide what to build next"], plan30: ["Complete 15 interviews", "Run three paid pilots", "Measure repeat usage", "Make a build, pivot or stop decision"], assumptions: ["The problem happens often", "Owners have a budget for improved lead handling"], sources: [{ title: "AI-generated directional analysis", url: "", domain: "No source" }, { title: "Founder interviews required", url: "", domain: "No source" }], evidence: { market: "assumption", customer: "assumption", competitors: "assumption", businessModel: "assumption" }, nextMove: { headline: "Get 3 home-service owners to prepay for a pilot month.", detail: "Offer the weekly growth plan plus follow-up sequences for a flat $99 setup fee this week. If nobody will pay it upfront, the demand isn't there yet." }, generatedBy: "fallback" } };
const agents = [["Mira", "Market intelligence", "MAP"], ["Asha", "Customer reality", "CUST"], ["Theo", "Competitive terrain", "COMP"], ["Owen", "Business model", "MODEL"], ["Rhea", "Risk review", "RISK"], ["Nova", "MVP & execution", "MVP"]];
const confidenceLabel: Record<Confidence, string> = { verified: "VERIFIED", estimate: "AI ESTIMATE", assumption: "ASSUMPTION" };
const confidenceClass: Record<Confidence, string> = { verified: "verified", estimate: "estimate", assumption: "assume" };

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report: StoredReport | null = id === "demo" ? demo : null;
  let memories: Memory[] = [];
  let signedIn = false;
  if (!report && hasSupabaseConfig()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (claims?.claims?.sub) {
      signedIn = true;
      const { data } = await supabase.from("reports").select("id,title,verdict,score,report,created_at").eq("id", id).maybeSingle();
      report = data as StoredReport | null;
      if (report) {
        const { data: memoryRows } = await supabase.from("founder_memories").select("id,kind,title,content,created_at").eq("report_id", id).order("created_at", { ascending: false }).limit(20);
        memories = memoryRows ?? [];
      }
    }
  }
  if (!report) notFound();
  const content = report.report;
  const verdictLine = report.verdict === "BUILD" ? "A strong opportunity, with a clear reason to pursue the next validation step." : report.verdict === "AVOID" ? "The current risks outweigh the likely opportunity." : "Promising direction, but earn the right to build through customer evidence.";
  const plan = content.plan7?.length ? content.plan7 : ["Write one target-customer hypothesis", "Book five customer conversations", "Create a simple offer page", "Ask for one paid pilot"];
  const scorecard = content.scorecard ?? { market: Math.min(88, report.score + 4), pain: Math.min(90, report.score + 7), differentiation: Math.max(25, report.score - 12), economics: Math.max(30, report.score - 4), execution: Math.max(25, report.score - 8) };
  const dimensions = [["Market", scorecard.market], ["Customer pain", scorecard.pain], ["Differentiation", scorecard.differentiation], ["Economics", scorecard.economics], ["Execution", scorecard.execution]] as const;
  const evidence = content.evidence ?? {};
  const hasVerified = Object.values(evidence).some(value => value === "verified");
  const sources = content.sources ?? [];
  const researchStatus = content.generatedBy === "fallback" ? "AI directional" : hasVerified ? "Grounded research" : "Mixed evidence";
  const nextMove = content.nextMove?.headline ? { headline: content.nextMove.headline, detail: content.nextMove.detail || "Ask for money, not just a conversation — a deposit, pilot fee, or signed intent." } : { headline: content.firstCustomers?.[0] || "Get one specific customer to commit money.", detail: "Ask for a paid pilot, deposit, or signed intent — not just a conversation. This report predates the paid-validation field; run a new session to get an idea-specific ask." };

  return <main className="app-shell report-shell">
    <header className="app-nav"><Link className="brand" href="/"><span className="brand-mark">✦</span> AI Co-Founder</Link><div><Link href="/reports">My reports</Link><Link href="/new">New idea</Link></div></header>
    <section className="report">
      <div className="report-cover print-only"><span>AI CO-FOUNDER</span><h1>{report.title}</h1><p>Founder decision brief · Generated {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(report.created_at))}</p><div><span>SCORE {report.score}/100</span><span>{report.verdict}</span></div></div>
      <div className="report-top"><div><Link className="back" href="/reports">← All reports</Link><div className="eyebrow"><span></span> CO-FOUNDER DECISION BRIEF</div><h1>{report.title}</h1><p>Generated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(report.created_at))} · Six specialist perspectives</p></div><ReportActions plan={plan} mode="export" /></div>
      <Tilt intensity={2.5}><div className="verdict-row"><div className="score"><small>BUSINESS SCORE</small><strong>{report.score}</strong><span>/100</span></div><div className="verdict"><small>RECOMMENDATION</small><h2><i></i>{report.verdict}</h2><p>{verdictLine}</p></div><div className="confidence"><small>RESEARCH STATUS</small><b>{researchStatus}</b><p>Claims are labelled to separate evidence from estimates.</p></div></div></Tilt>
      {content.evidenceApplied && <section className="evidence-banner section-break"><span>EVIDENCE-INFORMED UPDATE</span><h3>{content.priorVerdict && content.priorVerdict !== report.verdict ? `Verdict moved from ${content.priorVerdict} to ${report.verdict}` : "Verdict reviewed against founder evidence"}{typeof content.priorScore === "number" && content.priorScore !== report.score && ` · score ${content.priorScore} → ${report.score}`}</h3><p>{content.evidenceSummary}</p>{content.evidenceReasoning && <p className="muted">{content.evidenceReasoning}</p>}{!!content.repeatedSignals?.length && <ul>{content.repeatedSignals.map(item => <li key={item}>→ {item}</li>)}</ul>}<small>Based on {content.evidenceCount} founder-collected evidence entries{content.evidenceRecomputedAt ? ` · reviewed ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(content.evidenceRecomputedAt))}` : ""}.</small></section>}
      <section className="scorecard"><div><span>DIRECTIONAL SCORECARD</span><h2>What is carrying the decision?</h2><p>These are AI estimates based on the idea and intake submitted — not verified market facts.</p></div><div className="score-bars">{dimensions.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div></section>
      <section className="agent-strip"><div><span>THE ROOM</span><h2>Six specialists reviewed this idea.</h2></div><div className="agent-chips">{agents.map(([name, role, code], index) => <Tilt key={name} intensity={9}><article className={`agent-chip agent-${index}`}><b>{code}</b><div><strong>{name}</strong><small>{role}</small></div></article></Tilt>)}</div></section>
      <div className="report-grid">
        <div className="report-main">
          <ReportBlock tag="EXECUTIVE SUMMARY" title="The clearest path forward." text={content.summary} />
          <section className="decision-frame section-break"><div><span>DECISION GATE</span><h2>What must be true before you build?</h2><ol>{(content.assumptions ?? []).map((item, index) => <li key={item}><b>0{index + 1}</b><p>{item}</p></li>)}</ol></div><div><span>WHAT WOULD CHANGE THIS VERDICT</span><h3>Evidence to collect now</h3><ul>{(content.firstCustomers ?? []).map(item => <li key={item}>→ {item}</li>)}</ul></div></section>
          <div className="two"><ReportBlock tag="MARKET OPPORTUNITY" title="Where the signal may be." text={content.market} confidence={evidence.market} /><ReportBlock tag="TARGET CUSTOMER" title="Who needs this most." text={content.customer} confidence={evidence.customer} /></div>
          <div className="two"><ReportBlock tag="CUSTOMER PROBLEM" title="A job that won't wait." text={content.problem} confidence={evidence.customer} /><ReportBlock tag="COMPETITIVE GAP" title="Win by being specific." text={content.gap} confidence={evidence.competitors} /></div>
          <div className="two"><ReportBlock tag="COMPETITIVE TERRAIN" title="What they use today." text={content.competitors} confidence={evidence.competitors} /><ReportBlock tag="BUSINESS MODEL" title="How it could work." text={content.businessModel || content.pricing} confidence={evidence.businessModel} /></div>
          <ReportBlock tag="RECOMMENDED MVP" title="Build the smallest proof engine." list={content.mvp} />
          <ReportBlock tag="RISKS TO RETIRE" title="Do not ignore these." list={content.risks} />
          <ReportBlock tag="FEATURES TO AVOID" title="Keep the first version sharp." list={content.avoid} />
          <ReportBlock tag="30-DAY EXECUTION PLAN" title="Turn learning into momentum." list={content.plan30} />
          {signedIn && report.id && <section className="founder-evidence section-break"><div><span>FOUNDER EVIDENCE</span><h2>What you've collected since this brief.</h2><p>Interviews, outreach replies and pilot results tied to this report. Add more, then recompute the verdict below.</p></div>{memories.length ? <ul className="evidence-list">{memories.map(item => <li key={item.id}><small>{item.kind}</small><b>{item.title}</b><p>{item.content}</p></li>)}</ul> : <p className="empty-copy">No evidence linked to this report yet.</p>}<div className="evidence-actions"><Link href={`/v2?reportId=${report.id}`} className="plan-open">Add evidence for this report →</Link><RecomputeAction reportId={report.id} evidenceCount={memories.length} /></div></section>}
        </div>
        <aside>
          <Tilt intensity={5}><div className="side-card"><span>YOUR NEXT MOVE</span><h3>{nextMove.headline}</h3><p>{nextMove.detail}</p><ReportActions plan={plan} mode="plan" /></div></Tilt>
          <Tilt intensity={4}><div className="source-card"><span>RESEARCH TRACE</span><p><i className="verified"></i> Verified information</p><p><i className="estimate"></i> AI estimates</p><p><i className="assume"></i> Assumptions</p><hr />{sources.map((source, index) => source.url ? <a key={source.url + index} href={source.url} target="_blank" rel="noreferrer" className="source-link"><small>↗ {source.title}</small><em>{source.domain}</em></a> : <small key={source.title + index} className="source-plain">{source.title}</small>)}</div></Tilt>
        </aside>
      </div>
      <section className="source-appendix print-only"><span>SOURCE APPENDIX</span><h2>Full citation list</h2><ol>{sources.length ? sources.map((source, index) => <li key={source.title + index}>{source.title}{source.url ? ` — ${source.url}` : ""}</li>) : <li>No live web citations for this report — treat all findings as AI-directional.</li>}</ol></section>
      <div className="print-page-number print-only" />
    </section>
  </main>;
}

function ReportBlock({ tag, title, text, list, confidence }: { tag: string; title: string; text?: string; list?: string[]; confidence?: Confidence }) {
  const label = confidence ? confidenceLabel[confidence] : "AI ESTIMATE";
  const cls = confidence ? confidenceClass[confidence] : "estimate";
  return <Tilt intensity={2}><article className="block">
    <span>{tag}</span><h2>{title}</h2>
    {text && <p>{text}</p>}
    {list && <ul>{list.map(item => <li key={item}><b>✓</b>{item}</li>)}</ul>}
    <small className={`data-tag data-tag-${cls}`}><i className={cls}></i>{label}</small>
  </article></Tilt>;
}
