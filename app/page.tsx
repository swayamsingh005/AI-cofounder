"use client";

import { useRouter } from "next/navigation";
import AiOrb from "../components/ai-orb";
import Link from 'next/link';

const FEATURES = [
  { icon: "💡", title: "Explore Ideas", body: "Review AI-assisted research, sources and assumptions, then validate demand with customers." },
  { icon: "🎯", title: "Plan & Strategize", body: "Create goals, missions and actionable roadmaps aligned with your company vision." },
  { icon: "🚀", title: "Build Faster", body: "Break down execution into tasks, track progress and get AI guidance at every step." },
  { icon: "📈", title: "Review Evidence", body: "Connect supported tools, review recorded signals and choose your next action." },
];

export default function Home() {
  const router = useRouter();

  return (
    <main className="landing-v2">
      <nav className="landing-nav">
        <Link className="brand" href="/"><img src="/logo-mark.png" alt="" className="brand-mark" /> AI co-founder <span className="beta-badge">Beta</span></Link>
        <div className="nav-links">
          <a href="#features">How it works</a>
          <a href="/pricing">Pricing</a>
          <a href="/reports">My reports</a>
          <a className="log-in" href="/auth">Log in</a>
          <button className="cta-primary" onClick={() => router.push("/new")}>Explore your idea <span>→</span></button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy-v2">
          <div className="hero-badge">🚀 Your AI Partner in Building Extraordinary Companies.</div>
          <h1><em>Think bigger.</em><br />Build smarter.</h1>
          <p>Turn your idea into a structured plan with a CEO Agent. Review company evidence, coordinate focused agent work and approve proposed changes.</p>
          <div className="hero-cta-row">
            <button className="cta-primary large" onClick={() => router.push("/new")}>Explore your idea <span>→</span></button>
            <a href="#features" className="cta-ghost">▶ See how it works</a>
          </div>
          <div className="hero-trust">
            <span>✓ Explore your idea</span><span>✓ Review the evidence</span><span>✓ Approve proposed actions</span>
          </div>
        </div>

        <div className="hero-preview">
          <div className="preview-glow" />
          <div className="preview-panel">
            <div className="preview-top">
              <span className="preview-company">● LedgerAI <small>Sample company · Illustrative data</small></span>
            </div>
            <p className="preview-greeting">Good morning, Founder 👋</p>
            <small className="preview-sub">Here&rsquo;s what&rsquo;s happening today.</small>
            <div className="preview-stats">
              <div><small>Signup conversion</small><b className="stat-down">18.6%</b></div>
              <div><small>Active issues</small><b className="stat-warn">3</b></div>
              <div><small>New revenue</small><b className="stat-up">₹2.45L</b></div>
              <div><small>Mission progress</small><b>42%</b></div>
            </div>
            <div className="preview-next-action">
              <span>NEXT BEST ACTION</span>
              <b>Investigate signup conversion decline</b>
              <p>Conversion dropped after the latest onboarding release.</p>
              <button type="button">Investigate now →</button>
            </div>
          </div>
          <div className="preview-orb-card">
            <AiOrb size={52} />
            <div><b>AI Co-founder</b><small>I&rsquo;ve analyzed your data and found 3 things that need attention.</small></div>
          </div>
        </div>
      </section>

      <section id="features" className="feature-grid-section">
        {FEATURES.map(feature => (
          <article key={feature.title} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="closing-tagline">
        <p>More than a tool. It&rsquo;s your AI co-founder.</p>
        <h2>From idea to impact. Together.</h2>
      </section>

      <footer><span>© 2026 AI Co-Founder</span><span>Built for the messy early days.</span></footer>
    </main>
  );
}
