import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import ReportActions from "../../../components/report-actions";
import RecomputeAction from "../../../components/recompute-action";
import BuildCompanyCta from "../../../components/build-company-cta";
import AiOrb from "../../../components/ai-orb";

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

const confidenceLabel: Record<Confidence, string> = { verified: "FACT", estimate: "AI ESTIMATE", assumption: "ASSUMPTION" };
const confidenceClass: Record<Confidence, string> = { verified: "fact", estimate: "estimate", assumption: "assume" };

const NAV_SECTIONS = [
  ["summary", "Executive Summary"], ["opportunity", "01  Opportunity"], ["customer", "02  Customer"],
  ["market", "03  Market Analysis"], ["competition", "04  Competition"], ["model", "05  Business Model"],
  ["assumptions", "06  Assumptions"], ["risks", "07  Risk Review"], ["mvp", "08  MVP Blueprint"],
  ["plan", "09  Validation Plan"], ["verdict", "10  Final Verdict"],
] as const;

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
  const intake = content.intake ?? {};
  const verdictLine = report.verdict === "BUILD" ? "A strong opportunity, with a clear reason to pursue the next validation step." : report.verdict === "AVOID" ? "The current risks outweigh the likely opportunity." : "Promising direction, but earn the right to build through customer evidence.";
  const plan = content.plan7?.length ? content.plan7 : ["Write one target-customer hypothesis", "Book five customer conversations", "Create a simple offer page", "Ask for one paid pilot"];
  const evidence = content.evidence ?? {};
  const sources = content.sources ?? [];
  const researchStatus = content.generatedBy === "fallback" ? "Directional analysis" : sources.some(source => /^https?:\/\//i.test(source.url)) ? "References included" : "Sources not supplied";
  const nextMove = content.nextMove?.headline ? { headline: content.nextMove.headline, detail: content.nextMove.detail || "Ask for money, not just a conversation — a deposit, pilot fee, or signed intent." } : { headline: content.firstCustomers?.[0] || "Get one specific customer to commit money.", detail: "Ask for a paid pilot, deposit, or signed intent — not just a conversation." };
  const tags = [intake.geography, intake.businessModel, intake.customer].filter(Boolean) as string[];

  return <main className="app-shell report-shell report-v2">
    <div className="report-v2-grid">
      <aside className="report-sidebar">
        <Link className="brand" href="/"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI co-founder</Link>
        <small className="sidebar-tagline">Your AI Partner in Building Extraordinary Companies</small>

        <div className="report-nav">
          <span>REPORT NAVIGATION</span>
          {NAV_SECTIONS.map(([anchor, label]) => <a key={anchor} href={`#${anchor}`}>{label}</a>)}
        </div>

        <div className="report-details">
          <span>REPORT DETAILS</span>
          <dl>
            <div><dt>Generated on</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.created_at))}</dd></div>
            <div><dt>Idea</dt><dd>{report.title}</dd></div>
            {intake.geography && <div><dt>Geography</dt><dd>{intake.geography}</dd></div>}
            {intake.customer && <div><dt>Target customer</dt><dd>{intake.customer}</dd></div>}
            {intake.constraints && <div><dt>Constraints</dt><dd>{intake.constraints}</dd></div>}
          </dl>
          <ReportActions plan={plan} mode="export" />
        </div>

        {signedIn && report.id && (
          existingCompanyId ? (
            <div className="sidebar-build-cta"><AiOrb size={44} /><b>Company workspace ready</b><Link href={`/company/${existingCompanyId}`} className="cta-primary">Open workspace →</Link></div>
          ) : (
            <div className="sidebar-build-cta"><AiOrb size={44} /><b>Ready to build?</b><small>Transform this intelligence into execution.</small><BuildCompanyInlineButton reportId={report.id} /></div>
          )
        )}
      </aside>

      <div className="report-main-v2">
        <div className="report-cover print-only"><span>AI CO-FOUNDER</span><h1>{report.title}</h1><p>Founder decision brief · Generated {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(report.created_at))}</p><div><span>SCORE {report.score}/100</span><span>{report.verdict}</span></div></div>
        {content.generatedBy === "fallback" && id !== "demo" && <section className="fallback-banner"><span>⚠ NOT AI-GENERATED</span><p>{content.warning || "AI analysis didn't run for this report — this is the static directional fallback, not a response tailored to your idea."} <Link href="/new">Try generating it again</Link>.</p></section>}
        {content.evidenceApplied && <section className="evidence-banner"><span>EVIDENCE-INFORMED UPDATE</span><h3>{content.priorVerdict && content.priorVerdict !== report.verdict ? `Verdict moved from ${content.priorVerdict} to ${report.verdict}` : "Verdict reviewed against founder evidence"}{typeof content.priorScore === "number" && content.priorScore !== report.score && ` · score ${content.priorScore} → ${report.score}`}</h3><p>{content.evidenceSummary}</p>{content.evidenceReasoning && <p className="muted">{content.evidenceReasoning}</p>}{!!content.repeatedSignals?.length && <ul>{content.repeatedSignals.map(item => <li key={item}>→ {item}</li>)}</ul>}</section>}

        <div className="report-header-v2" id="summary">
          <div className="report-header-top"><span className="report-eyebrow">STARTUP INTELLIGENCE REPORT</span><span className={`confidence-pill confidence-${researchStatus.split(" ")[0].toLowerCase()}`}>{researchStatus}</span></div>
          <h1>{report.title}</h1>
          {content.summary && <p className="report-subtitle">{content.summary}</p>}
          {tags.length > 0 && <div className="tag-row">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
        </div>

        <section className="verdict-card">
          <VerdictRing score={report.score} verdict={report.verdict} />
          <div className="verdict-columns">
            <div><span>BIGGEST RISK</span><p>{content.risks?.[0] ?? "Not enough evidence yet to name one clearly."}</p></div>
            <div><span>FIRST BEST MOVE</span><p>{nextMove.headline}</p></div>
            <div><span>VERDICT SUMMARY</span><p>{verdictLine}</p><small>The score is an AI assessment, not a probability of business success. References do not independently validate customer demand.</small></div>
          </div>
          <div className="evidence-legend">
            <b>EVIDENCE KEY</b>
            <p><i className="fact"></i> FACT <small>Verifiable information</small></p>
            <p><i className="estimate"></i> AI ESTIMATE <small>AI&rsquo;s interpretation</small></p>
            <p><i className="assume"></i> ASSUMPTION <small>Needs validation</small></p>
          </div>
        </section>

        <ReportSection anchor="opportunity" number="01" title="The Opportunity" subtitle="Why this could be a real business">
          <div className="two-col">
            <EvidenceCard label="Market" confidence={evidence.market} items={content.market} />
            <EvidenceCard label="Customer Pain" confidence={evidence.customer} items={content.problem} />
          </div>
        </ReportSection>

        <ReportSection anchor="customer" number="02" title="Target Customer" subtitle="Primary ICP and what they need">
          <EvidenceCard confidence={evidence.customer} items={content.customer} />
          {intake.customer && <p className="icp-line"><b>ICP:</b> {intake.customer}</p>}
        </ReportSection>

        <ReportSection anchor="market" number="03" title="Market Analysis" subtitle="Directional signal, not a verified market-size claim">
          <EvidenceCard confidence={evidence.market} items={content.market} />
        </ReportSection>

        <ReportSection anchor="competition" number="04" title="Competitive Landscape" subtitle="How this compares to what exists today">
          <div className="two-col">
            <EvidenceCard label="What they use today" confidence={evidence.competitors} items={content.competitors} />
            <EvidenceCard label="The gap" confidence={evidence.competitors} items={content.gap} />
          </div>
        </ReportSection>

        <ReportSection anchor="model" number="05" title="Business Model" subtitle="How this could make money">
          <EvidenceCard confidence={evidence.businessModel} items={content.businessModel} />
          {content.pricing && <p className="pricing-note">{content.pricing}</p>}
        </ReportSection>

        <ReportSection anchor="assumptions" number="06" title="Critical Assumptions" subtitle="Must be validated before heavy investment">
          <ol className="assumption-list">{(content.assumptions ?? []).map((item, index) => <li key={item}><b>0{index + 1}</b><span>{item}<em className="status-pill unvalidated">UNVALIDATED</em></span></li>)}</ol>
        </ReportSection>

        <ReportSection anchor="risks" number="07" title="Risk Review" subtitle="What could stop this">
          <EvidenceCard items={content.risks} />
        </ReportSection>

        <ReportSection anchor="mvp" number="08" title="MVP Blueprint" subtitle="Build less. Validate more.">
          <div className="two-col mvp-blueprint">
            <div className="mvp-col build-now"><b>BUILD NOW (MVP)</b><ul>{(content.mvp ?? []).map(item => <li key={item}>✓ {item}</li>)}</ul></div>
            <div className="mvp-col not-now"><b>NOT NOW</b><ul>{(content.avoid ?? []).map(item => <li key={item}>✕ {item}</li>)}</ul></div>
          </div>
        </ReportSection>

        <ReportSection anchor="plan" number="09" title="Validation Plan" subtitle="Prove it before you scale it">
          <div className="validation-weeks">
            <div className="week-card"><span>THIS WEEK</span><ul>{plan.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div className="week-card"><span>NEXT 30 DAYS</span><ul>{(content.plan30 ?? []).map(item => <li key={item}>{item}</li>)}</ul></div>
          </div>
        </ReportSection>

        {signedIn && report.id && <section className="founder-evidence"><div><span>FOUNDER EVIDENCE</span><h2>What you&rsquo;ve collected since this brief.</h2><p>Interviews, outreach replies and pilot results tied to this report.</p></div>{memories.length ? <ul className="evidence-list">{memories.map(item => <li key={item.id}><small>{item.kind}</small><b>{item.title}</b><p>{item.content}</p></li>)}</ul> : <p className="empty-copy">No evidence linked to this report yet.</p>}<div className="evidence-actions"><Link href={`/v2?reportId=${report.id}`} className="plan-open">Add evidence for this report →</Link><RecomputeAction reportId={report.id} evidenceCount={memories.length} /></div></section>}

        <section className="final-verdict" id="verdict">
          <span>10  FINAL CO-FOUNDER VERDICT</span>
          <h2>{report.verdict} — {verdictLine}</h2>
          <p>{nextMove.detail}</p>
          <div className="final-verdict-actions">
            {signedIn && report.id && !existingCompanyId && <BuildCompanyInlineButton reportId={report.id} />}
            {signedIn && report.id && existingCompanyId && <Link href={`/company/${existingCompanyId}`} className="cta-primary large">Open company workspace →</Link>}
          </div>
        </section>

        <section className="source-appendix-v2"><span>SOURCES</span><ol>{sources.length ? sources.map((source, index) => source.url ? <li key={source.title + index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li> : <li key={source.title + index}>{source.title}</li>) : <li>No live web citations for this report — treat all findings as AI-directional.</li>}</ol></section>
        <div className="print-page-number print-only" />
      </div>
    </div>
  </main>;
}

function BuildCompanyInlineButton({ reportId }: { reportId: string }) {
  return <BuildCompanyCta reportId={reportId} existingCompanyId={null} />;
}

function ReportSection({ anchor, number, title, subtitle, children }: { anchor: string; number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="report-section-v2" id={anchor}>
    <div className="section-heading"><span>{number}</span><div><h2>{title}</h2><small>{subtitle}</small></div></div>
    {children}
  </section>;
}

function EvidenceCard({ label, confidence, items }: { label?: string; confidence?: Confidence; items?: string[] }) {
  const cls = confidence ? confidenceClass[confidence] : "estimate";
  const badge = confidence ? confidenceLabel[confidence] : "AI ESTIMATE";
  return <div className="evidence-card">
    {label && <b>{label}</b>}
    <ul>{(items ?? []).map(item => <li key={item}>{item}</li>)}</ul>
    <small className={`data-tag data-tag-${cls}`}><i className={cls}></i>{badge}</small>
  </div>;
}

function VerdictRing({ score, verdict }: { score: number; verdict: string }) {
  const size = 140, radius = 58, center = size / 2, circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  return <div className="verdict-ring-wrap">
    <svg viewBox={`0 0 ${size} ${size}`} className="verdict-ring">
      <circle cx={center} cy={center} r={radius} className="verdict-ring-track" />
      <circle cx={center} cy={center} r={radius} className="verdict-ring-fill" strokeDasharray={`${filled} ${circumference - filled}`} transform={`rotate(-90 ${center} ${center})`} />
      <text x={center} y={center - 6} textAnchor="middle" className="verdict-ring-score">{score}</text>
      <text x={center} y={center + 16} textAnchor="middle" className="verdict-ring-max">/100</text>
    </svg>
    <b className={`verdict-ring-label verdict-${verdict.toLowerCase().replace(" ", "-")}`}>{verdict}</b>
  </div>;
}
