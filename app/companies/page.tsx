import Link from "next/link";
import { createClient, hasSupabaseConfig } from "../../lib/supabase/server";

export default async function CompaniesList() {
  let companies: { id: string; name: string; stage: string; created_at: string }[] = [];
  let signedIn = false;
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (claims?.claims?.sub) {
      signedIn = true;
      const { data } = await supabase.from("companies").select("id,name,stage,created_at").order("created_at", { ascending: false });
      companies = data ?? [];
    }
  }

  return (
    <main className="app-shell">
      <header className="app-nav">
        <Link className="brand" href="/"><span className="brand-mark">✦</span> AI Co-Founder</Link>
        <div><Link href="/reports">Reports</Link><Link href="/new">New idea</Link></div>
      </header>
      <section className="list-page">
        <div className="eyebrow"><span></span> MY COMPANIES</div>
        <h1>Your companies.</h1>
        {!signedIn && <p>Sign in to see your companies.</p>}
        {signedIn && !companies.length && (
          <div className="empty-report">
            <p>No companies yet.</p>
            <small>Generate a V1 report and click &ldquo;Build This Company&rdquo; to turn it into a workspace.</small>
          </div>
        )}
        <div className="companies-grid">
          {companies.map(company => (
            <Link href={`/company/${company.id}`} key={company.id} className="company-card">
              <b>{company.stage}</b>
              <h3>{company.name}</h3>
              <small>Created {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(company.created_at))}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
