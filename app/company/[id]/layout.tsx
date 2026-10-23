import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import CompanySidebar from "../../../components/company-sidebar";
import CompanyTopBar from "../../../components/company-topbar";
import "./dashboard.css";
import "./v3.css";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id,name,stage").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  // Real account data only — a name if Google sign-in captured one, otherwise the email's first
  // letter. Never a fabricated placeholder.
  const rawMetadata = claims?.claims?.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof rawMetadata?.full_name === "string" ? rawMetadata.full_name : typeof rawMetadata?.name === "string" ? rawMetadata.name : null;
  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const initials = fullName ? fullName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() : email ? email[0].toUpperCase() : "?";

  return (
    <div className="company-app-frame dashboard-refresh v3-frame">
      <CompanyTopBar companyName={company.name} stage={company.stage} initials={initials} />
      <div className="company-shell-simple">
        <CompanySidebar companyId={company.id} companyName={company.name} stage={company.stage} />
        <main className="company-main-region">{children}</main>
      </div>
    </div>
  );
}
