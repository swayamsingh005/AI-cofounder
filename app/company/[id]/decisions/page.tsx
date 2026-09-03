import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import DecisionPanel from "../../../../components/decision-panel";

export default async function DecisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  const { data: decisions } = await supabase.from("decisions").select("id,title,reasoning,status").eq("company_id", id).order("created_at", { ascending: false });

  return (
    <section className="page-section">
      <div className="page-header"><span>DECISIONS</span><h1>Company decisions</h1></div>
      {!decisions?.length && (
        <p className="page-intro">No major decisions have been recorded yet. When you make an important strategic choice, save it here so your Co-Founder remembers why.</p>
      )}
      <DecisionPanel companyId={id} initialDecisions={decisions ?? []} />
    </section>
  );
}
