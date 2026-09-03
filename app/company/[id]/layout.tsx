import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import CompanySidebar from "../../../components/company-sidebar";
import AskCofounder from "../../../components/ask-cofounder";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id,name,stage").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  return (
    <div className="company-shell-3col">
      <CompanySidebar companyId={company.id} companyName={company.name} stage={company.stage} />
      <main className="company-main-region">{children}</main>
      <aside className="company-ai-region">
        <div className="cofounder-panel cofounder-panel-persistent">
          <span>AI CO-FOUNDER</span>
          <small className="cofounder-scope">Company-aware · {company.name}</small>
          <AskCofounder companyId={company.id} />
        </div>
      </aside>
    </div>
  );
}
