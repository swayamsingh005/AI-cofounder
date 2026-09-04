import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import CompanySidebar from "../../../components/company-sidebar";
import CompanyTopBar from "../../../components/company-topbar";
import AskCofounder from "../../../components/ask-cofounder";
import AiOrb from "../../../components/ai-orb";
import LocalTime from "../../../components/local-time";

const TIPS = [
  "Focus on solving one painful problem exceptionally well. Everything else is noise.",
  "A conversation is not evidence of demand. A paid commitment is.",
  "Talk to the customer who almost didn't buy — they know your real objections.",
  "Ship the smallest thing that could possibly prove the idea wrong.",
  "Track what you decided and why — future you will thank present you.",
  "The fastest way to lose a week is building a feature nobody asked for.",
  "If everyone is a customer, no one is. Narrow it until it hurts.",
];

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id,name,stage").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  const { data: conversations } = await supabase.from("conversations").select("id,title,updated_at").eq("company_id", id).order("updated_at", { ascending: false }).limit(3);
  const tip = TIPS[new Date().getDate() % TIPS.length];

  // Real account data only — a name if Google sign-in captured one, otherwise the email's first
  // letter. Never a fabricated placeholder.
  const rawMetadata = claims?.claims?.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof rawMetadata?.full_name === "string" ? rawMetadata.full_name : typeof rawMetadata?.name === "string" ? rawMetadata.name : null;
  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const initials = fullName ? fullName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() : email ? email[0].toUpperCase() : "?";

  return (
    <div className="company-app-frame">
      <CompanyTopBar companyName={company.name} stage={company.stage} initials={initials} />
      <div className="company-shell-3col">
        <CompanySidebar companyId={company.id} companyName={company.name} stage={company.stage} />
        <main className="company-main-region">{children}</main>
        <aside className="company-ai-region">
          <div className="cofounder-panel cofounder-panel-persistent">
            <div className="cofounder-panel-header">
              <AiOrb size={56} />
              <span>AI CO-FOUNDER</span>
              <small className="cofounder-scope">I&rsquo;m here to help you build, decide and grow {company.name}.</small>
            </div>
            <AskCofounder companyId={company.id} />
            {!!conversations?.length && (
              <div className="recent-conversations">
                <span>RECENT CONVERSATIONS</span>
                <ul>{conversations.map(c => <li key={c.id}><b>{c.title || "Untitled conversation"}</b><small><LocalTime iso={c.updated_at} /></small></li>)}</ul>
              </div>
            )}
            <div className="cofounder-tip"><span>CO-FOUNDER TIP OF THE DAY</span><p>&ldquo;{tip}&rdquo;</p></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
