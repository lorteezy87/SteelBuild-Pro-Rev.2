/**
 * Landing — public marketing page for steelbuild-pro.com.
 *
 * Multi-section marketing site shown to unauthenticated visitors.
 * Includes inline sign-in modal and demo-request form.
 *
 * Sections:
 *   Nav → Hero → Stats → Features → Workflow → Interface →
 *   Pricing → Testimonials → Demo CTA → Footer
 *
 * Receives `onLogin`, `isSubmitting`, and `loginError` from
 * AuthenticatedApp so the sign-in modal works without leaving the page.
 */

import React, { useState, useRef, useEffect } from "react";

/* ─── Data ────────────────────────────────────────────────────── */

const STATS = [
  { value: "220+", label: "Projects Managed", detail: "Steel, tilt-up & mixed structural delivery" },
  { value: "18%", label: "Risk Reduction", detail: "Average critical-path slip decrease" },
  { value: "99.2%", label: "QA Close-out", detail: "Digital traceability from fab to field" },
  { value: "2.4M", label: "Tons Tracked", detail: "Fabrication through erection" },
];

const FEATURES = [
  {
    icon: "⚙️", title: "Fabrication Command",
    body: "Weld maps, cut lists, and NCRs in one pane. Live release gates sync to shop work packages so nothing ships without sign-off.",
    tag: "SHOP",
  },
  {
    icon: "🏗️", title: "Field Execution",
    body: "Erection sequencing, crane picks, and lift plans tied to weather, access constraints, and real-time safety checks.",
    tag: "SITE",
  },
  {
    icon: "✅", title: "Quality & Compliance",
    body: "Inspection punchlists, photo evidence, torque logs, and turnover packages generated automatically with full audit trails.",
    tag: "QA/QC",
  },
  {
    icon: "💰", title: "Financial Control",
    body: "SOV, change orders, RFIs, and cost codes linked to progress curves. Executive dashboards replace spreadsheets.",
    tag: "COMMERCIAL",
  },
  {
    icon: "📋", title: "Drawing & Submittal Hub",
    body: "Version-controlled drawing sets, automated submittal routing, and AI-powered extraction from shop drawings and mark-ups.",
    tag: "DOCUMENTS",
  },
  {
    icon: "📊", title: "Schedule Intelligence",
    body: "Gantt charts with critical-path analysis, predecessor logic, and AI risk briefs that flag stalled tasks before they slip.",
    tag: "SCHEDULE",
  },
];

const WORKFLOW = [
  { step: "01", title: "Coordinate", text: "Sync drawings, RFIs, and submittals across trades. Route actions to accountable roles with deadlines." },
  { step: "02", title: "Execute", text: "Release work packages to shop and field with milestone checks, safety gates, and automated alerts." },
  { step: "03", title: "Verify", text: "Capture QC evidence, inspections, and safety observations with linked photos, forms, and sign-offs." },
  { step: "04", title: "Report", text: "Live dashboards for owners and executives. Export sealed close-out packages without rework." },
];

const PRICING = [
  {
    tier: "Team",
    price: "$49",
    period: "/user/mo",
    description: "For small fabrication shops and field crews getting started.",
    features: [
      "Up to 10 projects",
      "Schedule & task management",
      "Drawing management",
      "RFI tracking",
      "Photo documentation",
      "Mobile field access",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    tier: "Pro",
    price: "$89",
    period: "/user/mo",
    description: "Full platform for steel contractors running multiple projects.",
    features: [
      "Unlimited projects",
      "Everything in Team, plus:",
      "AI schedule risk briefs",
      "Submittal automation",
      "Financial control & SOV",
      "Custom reports & dashboards",
      "Quality & compliance module",
      "API integrations",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    tier: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large fabricators and GCs with complex delivery requirements.",
    features: [
      "Everything in Pro, plus:",
      "Dedicated success manager",
      "SSO & advanced security",
      "Custom integrations (ERP, BIM)",
      "Multi-region deployment",
      "SLA & priority support",
      "On-site training",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "SteelBuild Pro cut our RFI turnaround from 12 days to 3. The drawing hub alone paid for itself in the first month.",
    name: "Mike R.",
    role: "Project Manager",
    company: "Southwest Structural Steel",
  },
  {
    quote: "We used to lose half a day every week building status reports. Now the dashboard does it live. Our GC loves it.",
    name: "Sarah T.",
    role: "Operations Director",
    company: "Pacific Iron Works",
  },
  {
    quote: "The QA/QC module finally gives us the traceability our inspectors need without drowning in paperwork.",
    name: "James K.",
    role: "Quality Manager",
    company: "Pinnacle Steel Erectors",
  },
];

const NAV_LINKS = [
  { label: "Features", target: "features" },
  { label: "How It Works", target: "workflow" },
  { label: "Pricing", target: "pricing" },
  { label: "Contact", target: "demo" },
];

/* ─── Component ───────────────────────────────────────────────── */

export default function Landing({ onLogin, isSubmitting, loginError }) {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Demo form state
  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "", message: "" });
  const [demoSent, setDemoSent] = useState(false);

  const sectionRefs = {
    features: useRef(null),
    workflow: useRef(null),
    pricing: useRef(null),
    demo: useRef(null),
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close login modal on Escape
  useEffect(() => {
    if (!showLogin) return;
    const handler = (e) => { if (e.key === "Escape") setShowLogin(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showLogin]);

  const scrollTo = (key) => {
    sectionRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNav(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    await onLogin?.({ email: email.trim(), password });
  };

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    // In production this would POST to an API / edge function.
    // For now just show success.
    setDemoSent(true);
  };

  return (
    <div style={{ background: "#060810", color: "#E6EDF3", minHeight: "100vh", fontFamily: "'Inter', 'Barlow', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .lp-fade { animation: fadeInUp 0.7s ease both; }
        .lp-fade-d1 { animation-delay: 0.1s; }
        .lp-fade-d2 { animation-delay: 0.2s; }
        .lp-fade-d3 { animation-delay: 0.3s; }
        .lp-card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,155,32,0.15) !important; }
        .lp-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(200,155,32,0.4) !important; }
        .lp-btn-ghost:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.2) !important; }
        .lp-nav-link:hover { color: #C89B20 !important; }
        .lp-price-highlight { border-color: #C89B20 !important; box-shadow: 0 0 40px rgba(200,155,32,0.12), 0 20px 48px rgba(0,0,0,0.5) !important; }
        .lp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .lp-input { width: 100%; padding: 12px 14px; background: #0E1116; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #E6EDF3; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.2s; }
        .lp-input:focus { border-color: #C89B20; }
        .lp-input::placeholder { color: rgba(230,237,243,0.3); }
        @media (max-width: 768px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-nav-links { display: none !important; }
          .lp-mobile-toggle { display: flex !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-workflow-grid { grid-template-columns: 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center; }
        }
      `}</style>

      {/* ══════════════ NAV ══════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        padding: "0 28px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrolled ? "rgba(6,8,16,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px) saturate(150%)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        transition: "background 0.3s, border-color 0.3s, backdrop-filter 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #C89B20, #E0B030)",
            display: "grid", placeItems: "center",
            color: "#0B0E11", fontWeight: 900, fontSize: 14, letterSpacing: "0.06em",
            boxShadow: "0 4px 16px rgba(200,155,32,0.3)",
          }}>SB</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.14em", lineHeight: 1.2 }}>STEELBUILD PRO</div>
            <div style={{ fontSize: 10, color: "rgba(230,237,243,0.45)", letterSpacing: "0.08em" }}>STEEL DELIVERY PLATFORM</div>
          </div>
        </div>

        <div className="lp-nav-links" style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {NAV_LINKS.map(({ label, target }) => (
            <button key={target} className="lp-nav-link" onClick={() => scrollTo(target)} style={{
              background: "none", border: "none", color: "rgba(230,237,243,0.7)",
              fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer",
              transition: "color 0.2s", padding: 0, fontFamily: "inherit",
            }}>{label}</button>
          ))}
          <button onClick={() => setShowLogin(true)} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.15)",
            color: "#E6EDF3", padding: "8px 16px", borderRadius: 6,
            fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
            transition: "border-color 0.2s, background 0.2s", fontFamily: "inherit",
          }}>Sign In</button>
          <button className="lp-btn-primary" onClick={() => scrollTo("demo")} style={{
            background: "linear-gradient(135deg, #C89B20, #E0B030)",
            color: "#0B0E11", padding: "8px 18px", border: "none", borderRadius: 6,
            fontSize: 13, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em",
            boxShadow: "0 4px 16px rgba(200,155,32,0.3)",
            transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
          }}>Request Demo</button>
        </div>

        {/* Mobile hamburger */}
        <button className="lp-mobile-toggle" onClick={() => setMobileNav(!mobileNav)} style={{
          display: "none", background: "none", border: "none", color: "#E6EDF3",
          fontSize: 24, cursor: "pointer", padding: 4,
        }}>{mobileNav ? "✕" : "☰"}</button>
      </nav>

      {/* Mobile nav dropdown */}
      {mobileNav && (
        <div style={{
          position: "fixed", top: 64, left: 0, right: 0, zIndex: 49,
          background: "rgba(6,8,16,0.96)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "16px 28px", display: "flex", flexDirection: "column", gap: 12,
        }}>
          {NAV_LINKS.map(({ label, target }) => (
            <button key={target} onClick={() => scrollTo(target)} style={{
              background: "none", border: "none", color: "rgba(230,237,243,0.8)",
              fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left",
              padding: "8px 0", fontFamily: "inherit",
            }}>{label}</button>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={() => { setShowLogin(true); setMobileNav(false); }} style={{
              flex: 1, background: "none", border: "1px solid rgba(255,255,255,0.15)",
              color: "#E6EDF3", padding: "10px", borderRadius: 6,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>Sign In</button>
            <button onClick={() => { scrollTo("demo"); }} style={{
              flex: 1, background: "#C89B20", color: "#0B0E11", padding: "10px",
              border: "none", borderRadius: 6, fontSize: 13, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}>Request Demo</button>
          </div>
        </div>
      )}

      {/* ══════════════ HERO ══════════════ */}
      <section style={{
        paddingTop: 120, paddingBottom: 80, paddingLeft: 28, paddingRight: 28,
        position: "relative", overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(200,155,32,0.12), transparent 50%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(86,176,255,0.06), transparent 40%), #060810",
      }}>
        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }} />

        <div className="lp-hero-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", position: "relative" }}>
          <div className="lp-fade">
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(200,155,32,0.1)", border: "1px solid rgba(200,155,32,0.25)",
              marginBottom: 20,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "#22C55E", animation: "pulse 2s ease infinite" }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Now in production
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
              fontSize: "clamp(44px, 6vw, 76px)", lineHeight: 1.02,
              margin: "0 0 20px", letterSpacing: "-0.01em",
            }}>
              The operating system for structural steel.
            </h1>

            <p style={{ fontSize: 18, color: "rgba(230,237,243,0.65)", lineHeight: 1.65, margin: "0 0 32px", maxWidth: 520 }}>
              SteelBuild Pro unifies fabrication, erection, QA/QC, RFIs, and commercial control — so steel project teams move with precision, evidence, and speed.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button className="lp-btn-primary" onClick={() => scrollTo("demo")} style={{
                background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
                padding: "14px 28px", border: "none", borderRadius: 8,
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                letterSpacing: "0.08em", textTransform: "uppercase",
                boxShadow: "0 4px 24px rgba(200,155,32,0.35)",
                transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
              }}>Request a Demo</button>

              <button className="lp-btn-ghost" onClick={() => scrollTo("features")} style={{
                background: "transparent", color: "#E6EDF3",
                padding: "14px 28px", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "background 0.2s, border-color 0.2s", fontFamily: "inherit",
              }}>Explore Platform →</button>
            </div>
          </div>

          {/* Mock interface card */}
          <div className="lp-fade lp-fade-d2" style={{
            background: "linear-gradient(180deg, rgba(22,27,34,0.95), rgba(14,17,22,0.98))",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
            padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #C89B20, #E0B030, #C89B20)", opacity: 0.8 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.12em", textTransform: "uppercase" }}>Project Command Center</span>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "#22C55E" }} />
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "#C89B20" }} />
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.2)" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Active Tasks", value: "312", color: "#C89B20" },
                { label: "On Schedule", value: "94%", color: "#22C55E" },
                { label: "Open RFIs", value: "18", color: "#56B0FF" },
                { label: "QC Exceptions", value: "4", color: "#EF4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  padding: 14, borderRadius: 10,
                  background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, color: "rgba(230,237,243,0.4)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Mini progress bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Fabrication", pct: 78, color: "#C89B20" },
                { label: "Erection", pct: 45, color: "#56B0FF" },
                { label: "Close-out", pct: 22, color: "#22C55E" },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(230,237,243,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color, transition: "width 1s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ STATS ══════════════ */}
      <section style={{
        padding: "48px 28px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(22,27,34,0.5)",
      }}>
        <div className="lp-stats-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {STATS.map(({ value, label, detail }) => (
            <div key={label} style={{ textAlign: "center", padding: "12px 8px" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 38, color: "#C89B20", lineHeight: 1, marginBottom: 6 }}>{value}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "rgba(230,237,243,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: "rgba(230,237,243,0.4)" }}>{detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ FEATURES ══════════════ */}
      <section ref={sectionRefs.features} id="features" style={{ padding: "96px 28px", background: "#060810" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Platform Modules</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(32px, 4vw, 52px)", margin: "0 0 16px" }}>Everything steel teams need. Nothing they don't.</h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.55)", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
              Purpose-built for structural steel fabrication and erection — not generic PM software with a hard hat on.
            </p>
          </div>

          <div className="lp-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                cursor: "default",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <span style={{ fontSize: 28 }}>{f.icon}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
                    color: "#C89B20", letterSpacing: "0.14em", textTransform: "uppercase",
                    padding: "4px 8px", borderRadius: 4,
                    background: "rgba(200,155,32,0.1)", border: "1px solid rgba(200,155,32,0.2)",
                  }}>{f.tag}</span>
                </div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, margin: "0 0 10px" }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.55)" }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ WORKFLOW ══════════════ */}
      <section ref={sectionRefs.workflow} id="workflow" style={{
        padding: "96px 28px",
        background: "linear-gradient(180deg, rgba(22,27,34,0.4), #060810)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Delivery Workflow</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(32px, 4vw, 52px)", margin: "0 0 16px" }}>Four phases. Zero gaps.</h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.55)", maxWidth: 580, margin: "0 auto", lineHeight: 1.6 }}>
              From coordination through close-out, every step is tracked, evidenced, and reportable.
            </p>
          </div>

          <div className="lp-workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
            {WORKFLOW.map(({ step, title, text }) => (
              <div key={step} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 12, right: 16,
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 56,
                  color: "rgba(200,155,32,0.06)", lineHeight: 1,
                }}>{step}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.12em", marginBottom: 8 }}>STEP {step}</div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, margin: "0 0 10px" }}>{title}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.55)" }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section ref={sectionRefs.pricing} id="pricing" style={{
        padding: "96px 28px", background: "#060810",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(32px, 4vw, 52px)", margin: "0 0 16px" }}>Plans that scale with your shop.</h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.55)", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
              Start free for 14 days. No credit card required.
            </p>
          </div>

          <div className="lp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
            {PRICING.map((p) => (
              <div key={p.tier} className={`lp-card ${p.highlight ? "lp-price-highlight" : ""}`} style={{
                padding: 28, borderRadius: 16,
                background: "linear-gradient(180deg, rgba(22,27,34,0.95), rgba(14,17,22,0.98))",
                border: p.highlight ? "2px solid #C89B20" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: p.highlight
                  ? "0 0 40px rgba(200,155,32,0.12), 0 20px 48px rgba(0,0,0,0.5)"
                  : "0 8px 32px rgba(0,0,0,0.3)",
                display: "flex", flexDirection: "column", position: "relative",
              }}>
                {p.highlight && (
                  <div style={{
                    position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 800,
                    color: "#0B0E11", background: "#C89B20", padding: "4px 14px",
                    borderRadius: "0 0 6px 6px", letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>Most Popular</div>
                )}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "rgba(230,237,243,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12, marginTop: p.highlight ? 12 : 0 }}>{p.tier}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 44, color: "#E6EDF3" }}>{p.price}</span>
                  {p.period && <span style={{ fontSize: 14, color: "rgba(230,237,243,0.4)" }}>{p.period}</span>}
                </div>
                <p style={{ fontSize: 14, color: "rgba(230,237,243,0.5)", lineHeight: 1.5, marginBottom: 24, minHeight: 42 }}>{p.description}</p>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {p.features.map((feat) => (
                    <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "rgba(230,237,243,0.65)", lineHeight: 1.4 }}>
                      <span style={{ color: "#C89B20", fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <button className="lp-btn-primary" onClick={() => p.tier === "Enterprise" ? scrollTo("demo") : scrollTo("demo")} style={{
                  width: "100%", padding: "12px 0", border: "none", borderRadius: 8,
                  background: p.highlight ? "linear-gradient(135deg, #C89B20, #E0B030)" : "rgba(255,255,255,0.06)",
                  color: p.highlight ? "#0B0E11" : "#E6EDF3",
                  fontSize: 13, fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em",
                  textTransform: "uppercase", transition: "transform 0.2s, box-shadow 0.2s",
                  fontFamily: "inherit",
                }}>{p.cta}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ TESTIMONIALS ══════════════ */}
      <section style={{
        padding: "96px 28px",
        background: "linear-gradient(180deg, rgba(22,27,34,0.4), #060810)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>What Teams Say</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 4vw, 44px)", margin: 0 }}>Trusted by steel professionals.</h2>
          </div>

          <div className="lp-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}>
                <div style={{ fontSize: 28, color: "rgba(200,155,32,0.25)", marginBottom: 12, lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: "rgba(230,237,243,0.7)", margin: "0 0 20px", fontStyle: "italic" }}>{t.quote}</p>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#E6EDF3" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(230,237,243,0.45)" }}>{t.role}, {t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ DEMO REQUEST ══════════════ */}
      <section ref={sectionRefs.demo} id="demo" style={{
        padding: "96px 28px",
        background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(200,155,32,0.06), transparent 60%), #060810",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Get Started</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(28px, 4vw, 44px)", margin: "0 0 12px" }}>See your project in SteelBuild Pro.</h2>
            <p style={{ fontSize: 15, color: "rgba(230,237,243,0.55)", lineHeight: 1.6 }}>
              Book a 30-minute walkthrough with our team. We'll load your actual project data so you can see real results — not a canned demo.
            </p>
          </div>

          {demoSent ? (
            <div style={{
              padding: 32, borderRadius: 16, textAlign: "center",
              background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
              border: "1px solid rgba(34,197,94,0.3)",
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
              <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Request received!</h3>
              <p style={{ color: "rgba(230,237,243,0.6)", fontSize: 14 }}>We'll reach out within one business day to schedule your walkthrough.</p>
            </div>
          ) : (
            <form onSubmit={handleDemoSubmit} style={{
              padding: 32, borderRadius: 16,
              background: "linear-gradient(180deg, rgba(22,27,34,0.95), rgba(14,17,22,0.98))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              display: "flex", flexDirection: "column", gap: 18,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Name</label>
                  <input className="lp-input" type="text" placeholder="John Smith" value={demoForm.name} onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })} required />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Email</label>
                  <input className="lp-input" type="email" placeholder="john@company.com" value={demoForm.email} onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })} required />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Company</label>
                <input className="lp-input" type="text" placeholder="Acme Steel Fabrication" value={demoForm.company} onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })} required />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Message (optional)</label>
                <textarea className="lp-input" rows={3} placeholder="Tell us about your current workflow or challenges..." value={demoForm.message} onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })} style={{ resize: "vertical" }} />
              </div>
              <button className="lp-btn-primary" type="submit" style={{
                width: "100%", padding: "14px 0", border: "none", borderRadius: 8,
                background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
                fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em",
                textTransform: "uppercase", transition: "transform 0.2s, box-shadow 0.2s",
                fontFamily: "inherit",
              }}>Request Walkthrough →</button>
              <p style={{ textAlign: "center", fontSize: 12, color: "rgba(230,237,243,0.35)", margin: 0 }}>
                No commitment. No credit card. 30-minute session with a real project engineer.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer style={{
        padding: "48px 28px 32px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(14,17,22,0.6)",
      }}>
        <div className="lp-footer-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 32, marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6,
                background: "linear-gradient(135deg, #C89B20, #E0B030)",
                display: "grid", placeItems: "center",
                color: "#0B0E11", fontWeight: 900, fontSize: 12,
              }}>SB</div>
              <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.12em" }}>STEELBUILD PRO</span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(230,237,243,0.4)", lineHeight: 1.6, maxWidth: 300 }}>
              The operating system for structural steel delivery. Built by steel people, for steel people.
            </p>
          </div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 16 }}>Platform</div>
            {["Features", "Pricing", "Integrations", "Security"].map((l) => (
              <div key={l} style={{ marginBottom: 10 }}><button onClick={() => scrollTo(l === "Pricing" ? "pricing" : "features")} style={{ background: "none", border: "none", color: "rgba(230,237,243,0.55)", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{l}</button></div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 16 }}>Company</div>
            {["About", "Careers", "Contact", "Blog"].map((l) => (
              <div key={l} style={{ marginBottom: 10 }}><button onClick={() => scrollTo("demo")} style={{ background: "none", border: "none", color: "rgba(230,237,243,0.55)", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{l}</button></div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 16 }}>Legal</div>
            {["Privacy Policy", "Terms of Service", "EULA"].map((l) => (
              <div key={l} style={{ marginBottom: 10 }}><span style={{ color: "rgba(230,237,243,0.55)", fontSize: 13 }}>{l}</span></div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 12, color: "rgba(230,237,243,0.3)" }}>© {new Date().getFullYear()} SteelBuild Pro. All rights reserved.</span>
          <span style={{ fontSize: 12, color: "rgba(230,237,243,0.3)" }}>Phoenix, AZ · Built for steel contractors nationwide</span>
        </div>
      </footer>

      {/* ══════════════ SIGN IN MODAL ══════════════ */}
      {showLogin && (
        <div className="lp-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <div style={{
            width: "100%", maxWidth: 420, padding: 32,
            background: "linear-gradient(180deg, #161B22, #0E1116)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            position: "relative",
          }}>
            <button onClick={() => setShowLogin(false)} style={{
              position: "absolute", top: 16, right: 16,
              background: "none", border: "none", color: "rgba(230,237,243,0.4)",
              fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1,
            }}>✕</button>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>STEELBUILD PRO</div>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 28, margin: "0 0 6px" }}>Sign In</h2>
              <p style={{ fontSize: 13, color: "rgba(230,237,243,0.45)", margin: 0 }}>Enter your credentials to access the platform.</p>
            </div>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Email</label>
                <input className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Password</label>
                <input className="lp-input" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              {loginError && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#FCA5A5" }}>
                  {loginError}
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="lp-btn-primary" style={{
                width: "100%", padding: "12px 0", border: "none", borderRadius: 8,
                background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
                fontSize: 13, fontWeight: 800, cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.6 : 1, letterSpacing: "0.08em",
                textTransform: "uppercase", transition: "transform 0.2s, box-shadow 0.2s",
                fontFamily: "inherit",
              }}>
                {isSubmitting ? "Signing in..." : "Sign In →"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
