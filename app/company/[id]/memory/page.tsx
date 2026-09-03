import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import MemorySearch from "../../../../components/memory-search";

export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  const { data: memories } = await supabase.from("memories").select("id,kind,title,content").eq("company_id", id).order("created_at", { ascending: false });

  return (
    <section className="page-section">
      <div className="page-header"><span>MEMORY</span><h1>Company memory</h1></div>
      <MemorySearch memories={memories ?? []} />
    </section>
  );
}
