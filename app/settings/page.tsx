import Link from 'next/link';

export default function Settings() {
  return (
    <main className="app-shell">
      <header className="app-nav">
        <Link className="brand" href="/"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI Co-Founder</Link>
        <div><Link href="/new">New idea</Link><Link href="/reports">My reports</Link></div>
      </header>
      <section className="list-page settings">
        <div className="eyebrow"><span /> WORKSPACE SETTINGS</div>
        <h1>Make the room<br />your own.</h1>
        <div className="settings-card">
          <p>Workspace preferences are coming soon. Use your company workspace to manage its goals and connected tools.</p>
          <label>Founder name — Coming soon<input disabled placeholder="Coming soon" /></label>
          <label>Default market — Coming soon<input disabled placeholder="Set the market when describing your idea" /></label>
          <label>Research depth — Coming soon<select disabled defaultValue=""><option value="">Coming soon</option></select></label>
          <button className="primary-action" disabled>Coming soon</button>
          <Link href="/companies">Open my companies →</Link>
        </div>
      </section>
    </main>
  );
}
