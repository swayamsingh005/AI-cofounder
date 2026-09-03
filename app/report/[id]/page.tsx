import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import ReportActions from "../../../components/report-actions";
import RecomputeAction from "../../../components/recompute-action";
import Tilt from "../../../components/tilt";
import BuildCompanyCta from "../../../components/build-company-cta";

type Confidence = "verified" | "estimate" | "assumption";
type Source = { title: string; url: string; domain: string };
type Evidence = { market?: Confidence; customer?: Confidence; competitors?: Confidence; businessModel?: Confidence };
type ReportContent = {
  scorecard?: { market?: number; pain?: number; differentiation?: number; economics?: number; execution?: number };
  summary?: string; market?: string[]; customer?: string[]; problem?: string[]; competitors?: string[]; gap?: string[]; businessModel?: string[]; pricing?: string;
  risks?: string[]; mvp?: string[]; avoid?: string[]; firstCustomers?: string[]; plan7?: string[]; plan30?: string[]; assumptions?: string[];
  sources?: Source[]; evidence?: Evidence; nextMove?: { headline?: string; detail?: string }; generatedBy?: "groq" | "fallback"; warning?: string;
  intake?: { customer?: string; geography?: string; businessModel?: string; alternatives?: string; constraints?: string; outcome?: string };
  evidenceApplied?: boolean; evidenceRecomputedAt?: string; evidenceCount?: number; evidenceSummary?: string; evidenceReasoning?: string; repeatedSignals?: string[]; priorScore?: number; priorVerdict?: string;
};
type StoredReport = { id?: string; title: string; verdict: string; score: number; report: ReportContent; created_at: string };
type Memory = { id: string; kind: string; title: string; content: string; created_at: string };

const demo: StoredReport = { title: "Local service growth copilot", verdict: "TEST FIRST", score: 74, created_at: new Date().toISOString(), report: { summary: "A focused growth assistant for independent home-service businesses has a credible wedge: owners need more predictable enquiries but lack the time and specialist support to run marketing systems.", market: ["AI estimate: independent home-service operators are a reachable niche with recurring lead-generation pressure.", "No verified market-size figure exists yet — treat as directional."], customer: ["Owner-operators who manage jobs and marketing themselves.", "Time-poor, hands-on, and the budget decision-maker in one person."], problem: ["Owners lose leads because follow-up, review collection and local visibility are inconsistent.", "The cost shows up as missed jobs, not a single obvious failure."], competitors: ["Broad marketing suites built for larger teams, not solo operators.", "Agencies and manual spreadsheet-based follow-up fill the gap today."], gap: ["Existing tools are broad marketing suites or disconnected AI writers.", "A narrow, outcome-specific tool for this exact job is the opening."], businessModel: ["A subscription with an assisted onboarding pilot can test willingness to pay.", "Assumption: validate a monthly price with five founder interviews before setting a rate."], pricing: "Assumption: validate a monthly price with five founder interviews before setting a rate.", risks: ["Weak repeat usage after the first marketing plan", "Generic AI tools may feel sufficient"], mvp: ["Weekly growth plan built from a business profile", "Lead follow-up sequences for email and SMS", "Review request and local-content generator", "A simple results dashboard"], avoid: ["Broad platform features", "Premature automation"], firstCustomers: ["Interview 10 operators", "Offer a concierge pilot", "Ask for a paid commitment"], plan7: ["Write a narrow owner-operator hypothesis", "Book five customer conversations", "Document current workarounds", "Create a simple offer page", "Show the prototype to interviewees", "Ask for a paid pilot", "Decide what to build next"], plan30: ["Complete 15 interviews", "Run three paid pilots", "Measure repeat usage", "Make a build, pivot or stop decision"], assumptions: ["The problem happens often", "Owners have a budget for improved lead handling"], sources: [{ title: "AI-generated directional analysis", url: "", domain: "No source" }, { title: "Founder interviews required", url: "", domain: "No source" }], evidence: { market: "assumption", customer: "assumption", competitors: "assumption", businessModel: "assumption" }, nextMove: { headline: "Get 3 home-service owners to prepay for a pilot month.", detail: "Offer the weekly growth plan plus follow-up sequences for a flat $99 setup fee this week. If nobody will pay it upfront, the demand isn't there yet." }, generatedBy: "fallback" } };
const agents = [["Mira", "Market intelligence", "MAP"], ["Asha", "Customer reality", "CUST"], ["Theo", "Competitive terrain", "COMP"], ["Owen", "Business model", "MODEL"], ["Rhea", "Risk review", "RISK"], ["Nova", "MVP & execution", "MVP"]] as const;
const agentByCode = Object.fromEntries(agents.map(([name, role, code]) => [code, [name, role] as const]));
const confidenceLabel: Record<Confidence, string> = { verified: "VERIFIED", estimate: "AI ESTIMATE", assumption: "ASSUMPTION" };
const confidenceClass: Record<Confidence, string> = { verified: "verified", estimate: "estimate", assumption: "assume" };

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report: StoredReport | null = id === "demo" ? demo : null;
  let memories: Memory[] = [];
  let signedIn = false;
  let existingCompanyId: string | null = null;
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
        const { data: companyRow } = await supabase.from("companies").select("id").eq("report_id", id).maybeSingle();
        existingCompanyId = companyRow?.id ?? null;
      }
    }
  }
  if (!report) notFound();
  const content = report.report;
  const verdictLine = report.verdict === "BUILD" ? "A strong opportunity, with a clear reason to pursue the next validation step." : report.verdict === "AVOID" ? "The current risks outweigh the likely opportunity." : "Promising direction, but earn the right to build through customer evidence.";
  const plan = content.plan7?.length ? content.plan7 : ["Write one target-customer hypothesis", "Book five customer conversations", "Create a simple offer page", "Ask for one paid pilot"];
  const scorecardRaw = content.scorecard;
  const scorecard = { market: scorecardRaw?.market ?? Math.min(88, report.score + 4), pain: scorecardRaw?.pain ?? Math.min(90, report.score + 7), differentiation: scorecardRaw?.differentiation ?? Math.max(25, report.score - 12), economics: scorecardRaw?.economics ?? Math.max(30, report.score - 4), execution: scorecardRaw?.execution ?? Math.max(25, report.score - 8) };
  const dimensions = [["Market", scorecard.market], ["Customer pain", scorecard.pain], ["Differentiation", scorecard.differentiation], ["Economics", scorecard.economics], ["Execution", scorecard.execution]] as const;
  const evidence = content.evidence ?? {};
  const hasVerified = Object.values(evidence).some(value => value === "verified");
  const sources = content.sources ?? [];
  const researchStatus = content.generatedBy === "fallback" ? "AI directional" : hasVerified ? "Grounded research" : "Mixed evidence";
  const nextMove = content.nextMove?.headline ? { headline: content.nextMove.headline, detail: content.nextMove.detail || "Ask for money, not just a conversation — a deposit, pilot fee, or signed intent." } : { headline: content.firstCustomers?.[0] || "Get one specific customer to commit money.", detail: "Ask for a paid pilot, deposit, or signed intent — not just a conversation. This report predates the paid-validation field; run a new session to get an idea-specific ask." };
  const evidenceCounts = { verified: 0, estimate: 0, assumption: 0 };
  (Object.values(evidence) as (Confidence | undefined)[]).forEach(value => { if (value) evidenceCounts[value] += 1; });

  return <main className="app-shell report-shell">
    <header className="app-nav"><Link className="brand" href="/"><span className="brand-mark">✦</span> AI Co-Founder</Link><div><Link href="/reports">My reports</Link><Link href="/new">New idea</Link></div></header>
    <section className="report">
      <div className="report-cover print-only"><span>AI CO-FOUNDER</span><h1>{report.title}</h1><p>Founder decision brief · Generated {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(report.created_at))}</p><div><span>SCORE {report.score}/100</span><span>{report.verdict}</span></div></div>
      <div className="report-top"><div><Link className="back" href="/reports">← All reports</Link><div className="eyebrow"><span></span> CO-FOUNDER DECISION BRIEF</div><h1>{report.title}</h1><p>Generated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(report.created_at))} · Six specialist perspectives</p></div><ReportActions plan={plan} mode="export" /></div>
      <Tilt intensity={2.5}><div className="verdict-row"><div className="score"><small>BUSINESS SCORE</small><strong>{report.score}</strong><span>/100</span></div><div className="verdict"><small>RECOMMENDATION</small><h2><i></i>{report.verdict}</h2><p>{verdictLine}</p></div><div className="confidence"><small>RESEARCH STATUS</small><b>{researchStatus}</b><p>Claims are labelled to separate evidence from estimates.</p></div></div></Tilt>
      {content.generatedBy === "fallback" && id !== "demo" && <section className="fallback-banner"><span>⚠ NOT AI-GENERATED</span><p>{content.warning || "AI analysis didn't run for this report — this is the static directional fallback, not a response tailored to your idea."} <Link href="/new">Try generating it again</Link>, and if this keeps happening, check that the AI service is configured on this deployment.</p></section>}
      {content.evidenceApplied && <section className="evidence-banner section-break"><span>EVIDENCE-INFORMED UPDATE</span><h3>{content.priorVerdict && content.priorVerdict !== report.verdict ? `Verdict moved from ${content.priorVerdict} to ${report.verdict}` : "Verdict reviewed against founder evidence"}{typeof content.priorScore === "number" && content.priorScore !== report.score && ` · score ${content.priorScore} → ${report.score}`}</h3><p>{content.evidenceSummary}</p>{content.evidenceReasoning && <p className="muted">{content.evidenceReasoning}</p>}{typeof content.priorScore === "number" && <ScoreMovement prior={content.priorScore} current={report.score} />}{!!content.repeatedSignals?.length && <ul>{content.repeatedSignals.map(item => <li key={item}>→ {item}</li>)}</ul>}<small>Based on {content.evidenceCount} founder-collected evidence entries{content.evidenceRecomputedAt ? ` · reviewed ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(content.evidenceRecomputedAt))}` : ""}.</small></section>}
      <section className="scorecard"><div><span>DIRECTIONAL SCORECARD</span><h2>What is carrying the decision?</h2><p>These are AI estimates based on the idea and intake submitted — not verified market facts.</p></div><div className="score-visuals"><div className="score-bars">{dimensions.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div><ScoreRadar scorecard={scorecard} /></div></section>
      <section className="agent-strip"><div><span>THE ROOM</span><h2>Six specialists reviewed this idea.</h2></div><div className="agent-chips">{agents.map(([name, role, code], index) => <Tilt key={name} intensity={9}><article className={`agent-chip agent-${index}`}><b>{code}</b><div><strong>{name}</strong><small>{role}</small></div></article></Tilt>)}</div></section>
      <div className="report-grid">
        <div className="report-main">
          <ReportBlock tag="EXECUTIVE SUMMARY" title="The clearest path forward." text={content.summary} />
          <section className="decision-frame section-break"><div><span>DECISION GATE</span><h2>What must be true before you build?</h2><ol>{(content.assumptions ?? []).map((item, index) => <li key={item}><b>0{index + 1}</b><p>{item}</p></li>)}</ol></div><div><span>WHAT WOULD CHANGE THIS VERDICT</span><h3>Evidence to collect now</h3><ul>{(content.firstCustomers ?? []).map(item => <li key={item}>→ {item}</li>)}</ul></div></section>
          <div className="two"><ReportBlock tag="MARKET OPPORTUNITY" title="Where the signal may be." list={content.market} confidence={evidence.market} agent="MAP" /><ReportBlock tag="TARGET CUSTOMER" title="Who needs this most." list={content.customer} confidence={evidence.customer} agent="CUST" /></div>
          <div className="two"><ReportBlock tag="CUSTOMER PROBLEM" title="A job that won't wait." list={content.problem} confidence={evidence.customer} agent="CUST" /><ReportBlock tag="COMPETITIVE GAP" title="Win by being specific." list={content.gap} confidence={evidence.competitors} agent="COMP" /></div>
          <div className="two"><ReportBlock tag="COMPETITIVE TERRAIN" title="What they use today." list={content.competitors} confidence={evidence.competitors} agent="COMP" /><ReportBlock tag="BUSINESS MODEL" title="How it could work." list={content.businessModel} confidence={evidence.businessModel} agent="MODEL" /></div>
          <ReportBlock tag="RECOMMENDED MVP" title="Build the smallest proof engine." list={content.mvp} agent="MVP" />
          <ReportBlock tag="RISKS TO RETIRE" title="Do not ignore these." list={content.risks} agent="RISK" />
          <ReportBlock tag="FEATURES TO AVOID" title="Keep the first version sharp." list={content.avoid} agent="MVP" />
          <ReportBlock tag="30-DAY EXECUTION PLAN" title="Turn learning into momentum." list={content.plan30} agent="MVP" />
          {signedIn && report.id && <section className="founder-evidence section-break"><div><span>FOUNDER EVIDENCE</span><h2>What you've collected since this brief.</h2><p>Interviews, outreach replies and pilot results tied to this report. Add more, then recompute the verdict below.</p></div>{memories.length ? <ul className="evidence-list">{memories.map(item => <li key={item.id}><small>{item.kind}</small><b>{item.title}</b><p>{item.content}</p></li>)}</ul> : <p className="empty-copy">No evidence linked to this report yet.</p>}<div className="evidence-actions"><Link href={`/v2?reportId=${report.id}`} className="plan-open">Add evidence for this report →</Link><RecomputeAction reportId={report.id} evidenceCount={memories.length} /></div></section>}
        </div>
        <aside>
          <Tilt intensity={5}><div className="side-card"><span>YOUR NEXT MOVE</span><h3>{nextMove.headline}</h3><p>{nextMove.detail}</p><ReportActions plan={plan} mode="plan" /></div></Tilt>
          <Tilt intensity={4}><div className="source-card"><span>RESEARCH TRACE</span><ConfidenceDonut counts={evidenceCounts} /><p><i className="verified"></i> Verified information</p><p><i className="estimate"></i> AI estimates</p><p><i className="assume"></i> Assumptions</p><hr />{sources.map((source, index) => source.url ? <a key={source.url + index} href={source.url} target="_blank" rel="noreferrer" className="source-link"><small>↗ {source.title}</small><em>{source.domain}</em></a> : <small key={source.title + index} className="source-plain">{source.title}</small>)}</div></Tilt>
        </aside>
      </div>
      <section className="source-appendix print-only"><span>SOURCE APPENDIX</span><h2>Full citation list</h2><ol>{sources.length ? sources.map((source, index) => <li key={source.title + index}>{source.title}{source.url ? ` — ${source.url}` : ""}</li>) : <li>No live web citations for this report — treat all findings as AI-directional.</li>}</ol></section>
      {signedIn && report.id && <BuildCompanyCta reportId={report.id} existingCompanyId={existingCompanyId} />}
      <div className="print-page-number print-only" />
    </section>
  </main>;
}

function ConfidenceDonut({ counts }: { counts: { verified: number; estimate: number; assumption: number } }) {
  const total = counts.verified + counts.estimate + counts.assumption;
  const size = 128, radius = 46, center = size / 2, circumference = 2 * Math.PI * radius;
  const segments: [string, number, string][] = [["verified", counts.verified, "donut-verified"], ["estimate", counts.estimate, "donut-estimate"], ["assumption", counts.assumption, "donut-assumption"]];
  let offset = 0;
  return <svg viewBox={`0 0 ${size} ${size}`} className="donut-chart" role="img" aria-label={`${counts.verified} of ${total || 4} report sections are independently verified`}>
    <circle cx={center} cy={center} r={radius} className="donut-track" />
    <g transform={`rotate(-90 ${center} ${center})`}>
      {segments.map(([key, value, cls]) => {
        if (!value || !total) return null;
        const length = (value / total) * circumference;
        const el = <circle key={key} cx={center} cy={center} r={radius} className={`donut-seg ${cls}`} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
        offset += length;
        return el;
      })}
    </g>
    <text x={center} y={center - 2} textAnchor="middle" className="donut-total">{counts.verified}</text>
    <text x={center} y={center + 15} textAnchor="middle" className="donut-sub">of {total || 4} verified</text>
  </svg>;
}

function ScoreRadar({ scorecard }: { scorecard: { market: number; pain: number; differentiation: number; economics: number; execution: number } }) {
  const axes: [string, number][] = [["Market", scorecard.market], ["Pain", scorecard.pain], ["Diff.", scorecard.differentiation], ["Econ.", scorecard.economics], ["Exec.", scorecard.execution]];
  const size = 220, center = size / 2, maxR = 82;
  const angle = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  const pointAt = (i: number, frac: number) => { const r = maxR * frac; const a = angle(i); return [center + r * Math.cos(a), center + r * Math.sin(a)] as const; };
  const ring = (frac: number) => axes.map((_, i) => pointAt(i, frac).join(",")).join(" ");
  const shape = axes.map(([, value], i) => pointAt(i, Math.max(0.06, value / 100)).join(",")).join(" ");
  return <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart" role="img" aria-label="Scorecard radar chart">
    {[0.25, 0.5, 0.75, 1].map(frac => <polygon key={frac} points={ring(frac)} className="radar-ring" />)}
    {axes.map((_, i) => { const [x, y] = pointAt(i, 1); return <line key={i} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />; })}
    <polygon points={shape} className="radar-fill" />
    {axes.map(([label, value], i) => { const [x, y] = pointAt(i, 1.2); return <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">{label} {value}</text>; })}
  </svg>;
}

function ScoreMovement({ prior, current }: { prior: number; current: number }) {
  const width = 200, height = 46, padX = 18, padY = 8;
  const yFor = (value: number) => height - padY - (Math.max(0, Math.min(100, value)) / 100) * (height - padY * 2);
  const y1 = yFor(prior), y2 = yFor(current);
  return <svg viewBox={`0 0 ${width} ${height}`} className="movement-chart" role="img" aria-label={`Score moved from ${prior} to ${current}`}>
    <line x1={padX} y1={y1} x2={width - padX} y2={y2} className="movement-line" />
    <circle cx={padX} cy={y1} r={4} className="movement-dot prior" />
    <circle cx={width - padX} cy={y2} r={5} className="movement-dot current" />
    <text x={padX} y={y1 - 8} className="movement-text">{prior}</text>
    <text x={width - padX} y={y2 - 10} textAnchor="end" className="movement-text current">{current}</text>
  </svg>;
}

function ReportBlock({ tag, title, text, list, confidence, agent }: { tag: string; title: string; text?: string; list?: string[]; confidence?: Confidence; agent?: keyof typeof agentByCode }) {
  const label = confidence ? confidenceLabel[confidence] : "AI ESTIMATE";
  const cls = confidence ? confidenceClass[confidence] : "estimate";
  const attribution = agent ? agentByCode[agent] : undefined;
  return <Tilt intensity={2}><article className="block">
    {attribution && <div className="block-agent"><b>{agent}</b><span>{attribution[0]} <em>· {attribution[1]}</em></span></div>}
    <span>{tag}</span><h2>{title}</h2>
    {text && <p>{text}</p>}
    {list && <ul>{list.map(item => <li key={item}><b>✓</b>{item}</li>)}</ul>}
    <small className={`data-tag data-tag-${cls}`}><i className={cls}></i>{label}</small>
  </article></Tilt>;
}
