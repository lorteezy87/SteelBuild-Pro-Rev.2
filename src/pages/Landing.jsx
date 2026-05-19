/**
 * Landing — public marketing page for steelbuild-pro.com.
 *
 * Multi-section marketing site shown to unauthenticated visitors.
 * Includes inline sign-in modal and demo-request form.
 *
 * Sections:
 *   Nav → Hero → Pain Points → Stats → Features → Workflow →
 *   Pricing → Testimonials → Demo CTA → Footer
 *
 * Receives `onLogin`, `isSubmitting`, and `loginError` from
 * AuthenticatedApp so the sign-in modal works without leaving the page.
 */

import React, { useState, useRef, useEffect } from "react";

/* ─── Data ────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  {
    icon: "📋",
    pain: "Mill certs buried in someone's inbox",
    reality: "Your CWI needs the MTR for W14x90 heat number 84726 — but it's in a forwarded email from three weeks ago. Nobody knows which attachment is current.",
  },
  {
    icon: "📱",
    pain: "Field photos with no context",
    reality: "200 bolt-up photos on a foreman's phone. No piece marks. No grid lines. No connection IDs. Useless for the turnover package.",
  },
  {
    icon: "📊",
    pain: "RFIs dying in spreadsheet purgatory",
    reality: "Your RFI log is 14 tabs deep. The GC says they responded to RFI-047 last Tuesday. Your PM says they never got it. The EOR is waiting on both of you.",
  },
  {
    icon: "🔧",
    pain: "Shop drawings marked up on paper",
    reality: "The detailer sent Rev. C but the shop floor is fabricating Rev. B. The approval stamp is on a PDF in a folder called 'FINAL_FINAL_v2.'",
  },
  {
    icon: "⚠️",
    pain: "NCRs that live on sticky notes",
    reality: "A flange was welded on the wrong side of the connection plate. The welder knows. The foreman knows. But the NCR won't exist until someone finds time to write it up — if ever.",
  },
  {
    icon: "💰",
    pain: "Change orders you can't prove",
    reality: "The GC added 47 embed plates that weren't in the original scope. You have the email somewhere. Good luck finding it when they dispute your CO.",
  },
];

const STATS = [
  { value: "3.2×", label: "Faster RFI Cycles", detail: "12-day average → under 4 days" },
  { value: "100%", label: "MTR Traceability", detail: "Heat # to piece mark to erection grid" },
  { value: "67%", label: "Less Admin Time", detail: "PMs spend time managing steel, not spreadsheets" },
  { value: "0", label: "Lost Close-out Docs", detail: "Digital turnover packages, every time" },
];

const FEATURES = [
  {
    icon: "🔩",
    title: "Fabrication Tracking",
    body: "Track every piece from detailing through CNC, fit-up, welding, coating, and load-out. Weld maps, NDT reports, and coating DFTs linked to piece marks — not buried in folders.",
    tag: "SHOP",
    details: ["CNC file management & nesting", "Weld procedure tracking (WPS/PQR)", "Coating inspection & DFT logs", "Bundle & load-out sequencing"],
  },
  {
    icon: "🏗️",
    title: "Erection Management",
    body: "Erection sequences, crane pick plans, and bolt-up logs tied to the actual model. Know what's shaken out, what's plumbed, and what's punched — by grid line, by floor, by sequence.",
    tag: "FIELD",
    details: ["Shake-out & plumb-up tracking", "High-strength bolt inspection logs", "Crane pick planning & sequencing", "OSHA safety checkpoint gates"],
  },
  {
    icon: "✅",
    title: "QA/QC & Inspections",
    body: "CWI inspection reports, torque logs, and weld visual records with geo-tagged photos linked to connection IDs. Build the turnover package as you go — not in a panic at close-out.",
    tag: "QUALITY",
    details: ["AWS D1.1 / D1.8 compliance tracking", "Torque & tension inspection logs", "Photo documentation with piece marks", "Automated turnover package assembly"],
  },
  {
    icon: "📐",
    title: "Drawing & Submittal Control",
    body: "Version-controlled shop drawing sets with automated approval routing. AI extracts piece marks, quantities, and connection details from submittals — so your log is always current.",
    tag: "DOCUMENTS",
    details: ["Automatic rev control & distribution", "AI-powered drawing data extraction", "Submittal routing with EOR/GC tracking", "Mark-up overlay comparison tools"],
  },
  {
    icon: "💰",
    title: "Commercial & Cost Control",
    body: "SOV progress tied to actual field completion — not guesses. Change order backup assembled from RFIs, drawing deltas, and field directives. Your money trail is airtight.",
    tag: "COMMERCIAL",
    details: ["SOV linked to erection progress", "Change order evidence packaging", "Cost code tracking by work package", "Subcontractor pay app management"],
  },
  {
    icon: "📊",
    title: "Schedule & Risk Intelligence",
    body: "Gantt charts with predecessor logic built for steel delivery — not generic construction scheduling. AI flags when a late approval will cascade into an erection delay before it happens.",
    tag: "SCHEDULE",
    details: ["Steel-specific milestone templates", "Approval-to-fabrication lead time tracking", "Critical path risk alerts (AI-driven)", "Look-ahead reports by erection sequence"],
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Award → Detailing",
    text: "Contract hits. Import the scope, set up drawing sets, assign detailers. Submittal packages route automatically — with deadlines the GC can't ignore.",
    milestone: "SUBMITTALS OUT",
  },
  {
    step: "02",
    title: "Shop → Fab",
    text: "Approved drawings release to CNC. Track every piece through fit-up, welding, NDT, coating, and bundling. Nothing ships without QC sign-off.",
    milestone: "LOAD-OUT READY",
  },
  {
    step: "03",
    title: "Delivery → Erection",
    text: "Shipping tickets auto-match to erection sequences. Field crews log shake-out, plumb-up, bolt-up, and inspection with photos — by connection, by grid line.",
    milestone: "TOPPED OUT",
  },
  {
    step: "04",
    title: "Punch → Close-out",
    text: "Punch lists, final inspections, and as-built mark-ups flow into a sealed turnover package. MTRs, weld records, bolt logs, and NDT — all in one deliverable.",
    milestone: "TURNOVER COMPLETE",
  },
];

const PRICING = [
  {
    tier: "Shop",
    price: "$49",
    period: "/user/mo",
    description: "For fab shops running 1–5 active projects. Get off spreadsheets.",
    features: [
      "Up to 10 active projects",
      "Drawing management & rev control",
      "RFI tracking & routing",
      "Photo documentation",
      "Basic schedule & task management",
      "Mobile field access (iOS & Android)",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    tier: "Contractor",
    price: "$89",
    period: "/user/mo",
    description: "Full platform for steel contractors running fab + erection.",
    features: [
      "Unlimited projects",
      "Everything in Shop, plus:",
      "Fabrication & erection tracking",
      "QA/QC inspection module",
      "AI schedule risk alerts",
      "Submittal automation & AI extraction",
      "Financial control & SOV",
      "Custom dashboards & reports",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    tier: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large fabricators, GCs, and multi-shop operations.",
    features: [
      "Everything in Contractor, plus:",
      "Multi-shop / multi-yard support",
      "SSO & advanced security",
      "ERP & BIM integrations (Tekla, SDS/2)",
      "Dedicated success engineer",
      "Custom SLA & priority support",
      "On-site onboarding & training",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "We were running a 4,200-ton hospital job on spreadsheets and Bluebeam markups. Switched to SteelBuild Pro mid-project and our RFI turnaround went from 12 days to 3. The GC actually commented on it.",
    name: "Mike R.",
    role: "Project Manager",
    company: "Regional Steel Fabricator — Phoenix, AZ",
    project: "4,200-ton healthcare facility",
  },
  {
    quote: "Close-out used to take us 3 weeks of digging through email for mill certs and weld records. Now the turnover package builds itself as we go. Our last project closed out in 2 days.",
    name: "Sarah T.",
    role: "Quality Manager",
    company: "Structural Steel Erector — Denver, CO",
    project: "Multi-story office complex",
  },
  {
    quote: "My foremen hated the old paper bolt-up logs. Now they snap a photo, tag the connection, and it's done. The CWI can pull every inspection record by grid line from his truck.",
    name: "James K.",
    role: "Field Superintendent",
    company: "Steel Erection Contractor — Dallas, TX",
    project: "12-story mixed-use tower",
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
  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "", phone: "", tonnage: "", message: "" });
  const [demoSent, setDemoSent] = useState(false);

  const sectionRefs = {
    pain: useRef(null),
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
    setDemoSent(true);
  };

  return (
    <div style={{ background: "#060810", color: "#E6EDF3", minHeight: "100vh", fontFamily: "'Inter', 'Barlow', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes sparks {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
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
        .lp-pain-card:hover { border-color: rgba(239,68,68,0.3) !important; background: rgba(239,68,68,0.03) !important; }
        .lp-pain-card { transition: border-color 0.3s, background 0.3s; }
        .lp-feature-detail { transition: max-height 0.3s ease, opacity 0.3s ease; }
        .lp-hero-accent {
          background: linear-gradient(90deg, #C89B20, #E0B030, #C89B20);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: sparks 3s ease-in-out infinite;
        }
        .lp-divider-line {
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(200,155,32,0.3), transparent);
        }
        @media (max-width: 768px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-nav-links { display: none !important; }
          .lp-mobile-toggle { display: flex !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-workflow-grid { grid-template-columns: 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr !important; }
          .lp-pain-grid { grid-template-columns: 1fr !important; }
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
        paddingTop: 120, paddingBottom: 64, paddingLeft: 28, paddingRight: 28,
        position: "relative", overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(200,155,32,0.14), transparent 50%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(239,68,68,0.04), transparent 40%), #060810",
      }}>
        {/* Diagonal hazard stripe accent */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 4,
          background: "repeating-linear-gradient(90deg, #C89B20 0px, #C89B20 20px, transparent 20px, transparent 40px)",
          opacity: 0.6,
        }} />

        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }} />

        <div className="lp-hero-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48, alignItems: "center", position: "relative" }}>
          <div className="lp-fade">
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(200,155,32,0.1)", border: "1px solid rgba(200,155,32,0.25)",
              marginBottom: 24,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "#22C55E", animation: "pulse 2s ease infinite" }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Built by steel people
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900,
              fontSize: "clamp(40px, 5.5vw, 72px)", lineHeight: 1.0,
              margin: "0 0 12px", letterSpacing: "-0.02em",
            }}>
              Your steel is only as good as<br />
              <span className="lp-hero-accent">the system behind it.</span>
            </h1>

            <p style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 600,
              color: "rgba(239,68,68,0.8)", letterSpacing: "0.02em",
              margin: "0 0 16px", lineHeight: 1.5,
            }}>
              Still chasing mill certs through email? Tracking bolt-up on paper? Losing RFIs in spreadsheet tabs?
            </p>

            <p style={{ fontSize: 17, color: "rgba(230,237,243,0.6)", lineHeight: 1.65, margin: "0 0 32px", maxWidth: 540 }}>
              SteelBuild Pro is the project delivery platform built for structural steel fabricators and erectors.
              From detailing approval to turnover package — every piece mark, every heat number, every weld record.
              One system. Zero excuses.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 32 }}>
              <button className="lp-btn-primary" onClick={() => scrollTo("demo")} style={{
                background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
                padding: "14px 28px", border: "none", borderRadius: 8,
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                letterSpacing: "0.08em", textTransform: "uppercase",
                boxShadow: "0 4px 24px rgba(200,155,32,0.35)",
                transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
              }}>See It With Your Data</button>

              <button className="lp-btn-ghost" onClick={() => scrollTo("pain")} style={{
                background: "transparent", color: "#E6EDF3",
                padding: "14px 28px", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "background 0.2s, border-color 0.2s", fontFamily: "inherit",
              }}>Sound Familiar? &darr;</button>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              {["AISC Certified Fabricators", "AWS D1.1 Compliant", "OSHA Record-Ready"].map((badge) => (
                <span key={badge} style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700,
                  color: "rgba(230,237,243,0.35)", letterSpacing: "0.1em", textTransform: "uppercase",
                  padding: "4px 10px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4,
                }}>{badge}</span>
              ))}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.12em", textTransform: "uppercase" }}>Project Command Center</span>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "#22C55E" }} />
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "#C89B20" }} />
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.2)" }} />
              </div>
            </div>

            {/* Project header */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(200,155,32,0.06)", border: "1px solid rgba(200,155,32,0.12)", marginBottom: 14 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(230,237,243,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>ACTIVE PROJECT</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, color: "#E6EDF3" }}>24426 — Capstone Medical Center</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(230,237,243,0.35)" }}>3,847 tons &middot; 428 pieces &middot; Phase 2 Erection</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Fab Released", value: "89%", color: "#C89B20" },
                { label: "Erected", value: "62%", color: "#22C55E" },
                { label: "Open RFIs", value: "7", color: "#56B0FF" },
                { label: "NCRs Open", value: "2", color: "#EF4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  padding: 12, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, color: "rgba(230,237,243,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Phase progress */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Detailing", pct: 100, color: "#22C55E" },
                { label: "Fabrication", pct: 89, color: "#C89B20" },
                { label: "Erection", pct: 62, color: "#56B0FF" },
                { label: "Close-out", pct: 15, color: "rgba(230,237,243,0.3)" },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(230,237,243,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color, transition: "width 1s ease" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700, color: "rgba(230,237,243,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>LATEST ACTIVITY</div>
              {[
                { time: "2m ago", text: "Bolt inspection — Grid L4/E, Conn. #247", color: "#22C55E" },
                { time: "18m ago", text: "RFI-052 response received from EOR", color: "#56B0FF" },
                { time: "1h ago", text: "Truck #14 shake-out complete — 12 pcs", color: "#C89B20" },
              ].map(({ time, text, color }) => (
                <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ width: 4, height: 4, borderRadius: 2, background: color, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(230,237,243,0.55)" }}>{text}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(230,237,243,0.25)", marginLeft: 6 }}>{time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ PAIN POINTS — "SOUND FAMILIAR?" ══════════════ */}
      <section ref={sectionRefs.pain} id="pain" style={{
        padding: "80px 28px",
        background: "linear-gradient(180deg, rgba(22,27,34,0.5), rgba(14,17,22,0.3))",
        borderTop: "1px solid rgba(239,68,68,0.1)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.2), transparent)",
        }} />

        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#EF4444", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Sound Familiar?</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 48px)", margin: "0 0 12px" }}>
              This is how steel projects fail.
            </h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.5)", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
              Not in one big disaster — in a thousand small gaps. Documents that can't be found. Inspections that weren't recorded. Evidence that doesn't exist when you need it.
            </p>
          </div>

          <div className="lp-pain-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {PAIN_POINTS.map((p) => (
              <div key={p.pain} className="lp-pain-card" style={{
                padding: 22, borderRadius: 12,
                background: "rgba(14,17,22,0.6)",
                border: "1px solid rgba(239,68,68,0.08)",
                cursor: "default",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0, marginTop: -2 }}>{p.icon}</span>
                  <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, margin: 0, color: "#EF4444", lineHeight: 1.2 }}>{p.pain}</h3>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "rgba(230,237,243,0.5)", fontStyle: "italic" }}>
                  {p.reality}
                </p>
              </div>
            ))}
          </div>

          {/* Transition CTA */}
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <div className="lp-divider-line" style={{ maxWidth: 200, margin: "0 auto 24px" }} />
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(20px, 3vw, 32px)", color: "#C89B20", marginBottom: 8 }}>
              SteelBuild Pro was built to kill every one of these problems.
            </p>
            <p style={{ fontSize: 14, color: "rgba(230,237,243,0.45)", marginBottom: 20 }}>
              Not with generic PM features. With tools designed for structural steel from the ground up.
            </p>
            <button className="lp-btn-primary" onClick={() => scrollTo("features")} style={{
              background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
              padding: "12px 24px", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 800, cursor: "pointer",
              letterSpacing: "0.08em", textTransform: "uppercase",
              boxShadow: "0 4px 16px rgba(200,155,32,0.3)",
              transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit",
            }}>See How &darr;</button>
          </div>
        </div>
      </section>

      {/* ══════════════ STATS ══════════════ */}
      <section style={{
        padding: "48px 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(22,27,34,0.3)",
      }}>
        <div className="lp-stats-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {STATS.map(({ value, label, detail }) => (
            <div key={label} style={{ textAlign: "center", padding: "12px 8px" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 42, color: "#C89B20", lineHeight: 1, marginBottom: 6 }}>{value}</div>
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
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 48px)", margin: "0 0 14px" }}>
              Built for steel. Not adapted from generic PM.
            </h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.5)", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
              Every module speaks the language of structural steel — piece marks, heat numbers, connection IDs, grid lines, erection sequences. Because a foreman shouldn't have to translate.
            </p>
          </div>

          <div className="lp-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                cursor: "default", display: "flex", flexDirection: "column",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{f.icon}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
                    color: "#C89B20", letterSpacing: "0.14em", textTransform: "uppercase",
                    padding: "4px 8px", borderRadius: 4,
                    background: "rgba(200,155,32,0.1)", border: "1px solid rgba(200,155,32,0.2)",
                  }}>{f.tag}</span>
                </div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, margin: "0 0 8px" }}>{f.title}</h3>
                <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.55)", flex: 1 }}>{f.body}</p>

                {/* Capability list */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
                  {f.details.map((d) => (
                    <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                      <span style={{ color: "#C89B20", fontSize: 10, lineHeight: 1.5, flexShrink: 0, fontWeight: 700 }}>+</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(230,237,243,0.45)", lineHeight: 1.4 }}>{d}</span>
                    </div>
                  ))}
                </div>
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
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Steel Delivery Lifecycle</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 48px)", margin: "0 0 14px" }}>
              Award to turnover. Every piece tracked.
            </h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.5)", maxWidth: 580, margin: "0 auto", lineHeight: 1.6 }}>
              SteelBuild Pro follows the actual lifecycle of a steel project — not a generic "plan, build, close" framework.
            </p>
          </div>

          <div className="lp-workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
            {WORKFLOW.map(({ step, title, text, milestone }) => (
              <div key={step} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                position: "relative", overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  position: "absolute", top: 12, right: 16,
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 56,
                  color: "rgba(200,155,32,0.06)", lineHeight: 1,
                }}>{step}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.12em", marginBottom: 8 }}>PHASE {step}</div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, margin: "0 0 10px" }}>{title}</h3>
                <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.55)", flex: 1 }}>{text}</p>

                {/* Milestone badge */}
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 800,
                  color: "#22C55E", letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "6px 10px", borderRadius: 4,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
                  textAlign: "center",
                }}>{milestone}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ DIFFERENTIATOR CALLOUT ══════════════ */}
      <section style={{
        padding: "64px 28px",
        background: "rgba(200,155,32,0.04)",
        borderTop: "1px solid rgba(200,155,32,0.1)",
        borderBottom: "1px solid rgba(200,155,32,0.1)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(24px, 3.5vw, 40px)", margin: "0 0 20px", lineHeight: 1.15 }}>
            "We tried Procore. We tried Fieldwire.<br />
            <span style={{ color: "#C89B20" }}>Neither one speaks steel."</span>
          </h2>
          <p style={{ fontSize: 15, color: "rgba(230,237,243,0.5)", lineHeight: 1.65, maxWidth: 680, margin: "0 auto 24px" }}>
            General construction software forces steel contractors to build workarounds. SteelBuild Pro was designed from day one
            for the way structural steel projects actually work — piece-level tracking, connection-based QC, and the real
            approval workflows that EORs, GCs, and fabricators deal with every day.
          </p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { label: "Piece Mark Tracking", sub: "Not generic tasks" },
              { label: "Connection-Based QC", sub: "Not punchlists" },
              { label: "Heat Number Traceability", sub: "Not just material logs" },
              { label: "Erection Sequence Logic", sub: "Not Gantt-only scheduling" },
            ].map(({ label, sub }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: 11, color: "rgba(230,237,243,0.35)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section ref={sectionRefs.pricing} id="pricing" style={{
        padding: "96px 28px", background: "#060810",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 48px)", margin: "0 0 14px" }}>Plans that scale with your yard.</h2>
            <p style={{ fontSize: 16, color: "rgba(230,237,243,0.5)", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
              Start free for 14 days. No credit card. Cancel anytime.
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
                      <span style={{ color: "#C89B20", fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>{"✓"}</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <button className="lp-btn-primary" onClick={() => scrollTo("demo")} style={{
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
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>From the Field</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 44px)", margin: 0 }}>Steel people. Real projects. Actual results.</h2>
          </div>

          <div className="lp-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="lp-card" style={{
                padding: 24, borderRadius: 14,
                background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ fontSize: 28, color: "rgba(200,155,32,0.25)", marginBottom: 8, lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(230,237,243,0.65)", margin: "0 0 16px", fontStyle: "italic", flex: 1 }}>{t.quote}</p>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#E6EDF3" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(230,237,243,0.45)" }}>{t.role}</div>
                  <div style={{ fontSize: 11, color: "rgba(230,237,243,0.35)", marginTop: 2 }}>{t.company}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(200,155,32,0.5)", marginTop: 4 }}>{t.project}</div>
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
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 44px)", margin: "0 0 12px" }}>See your steel project in SteelBuild Pro.</h2>
            <p style={{ fontSize: 15, color: "rgba(230,237,243,0.55)", lineHeight: 1.6 }}>
              Book a 30-minute walkthrough. We'll load your actual project data — your drawing sets, your RFI log, your erection sequences. No canned demo. Real steel.
            </p>
          </div>

          {demoSent ? (
            <div style={{
              padding: 32, borderRadius: 16, textAlign: "center",
              background: "linear-gradient(180deg, rgba(22,27,34,0.9), rgba(14,17,22,0.95))",
              border: "1px solid rgba(34,197,94,0.3)",
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{"✓"}</div>
              <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Request received.</h3>
              <p style={{ color: "rgba(230,237,243,0.6)", fontSize: 14 }}>We'll reach out within one business day to schedule your walkthrough.</p>
            </div>
          ) : (
            <form onSubmit={handleDemoSubmit} style={{
              padding: 32, borderRadius: 16,
              background: "linear-gradient(180deg, rgba(22,27,34,0.95), rgba(14,17,22,0.98))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              display: "flex", flexDirection: "column", gap: 16,
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Company</label>
                  <input className="lp-input" type="text" placeholder="Acme Steel Fabrication" value={demoForm.company} onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })} required />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>Annual Tonnage (approx.)</label>
                  <input className="lp-input" type="text" placeholder="e.g. 5,000 tons" value={demoForm.tonnage} onChange={(e) => setDemoForm({ ...demoForm, tonnage: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,237,243,0.5)", marginBottom: 6 }}>What's your biggest pain right now?</label>
                <textarea className="lp-input" rows={3} placeholder="e.g. Close-out packages take us 3 weeks. RFIs get lost. Our GC hates our submittals." value={demoForm.message} onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })} style={{ resize: "vertical" }} />
              </div>
              <button className="lp-btn-primary" type="submit" style={{
                width: "100%", padding: "14px 0", border: "none", borderRadius: 8,
                background: "linear-gradient(135deg, #C89B20, #E0B030)", color: "#0B0E11",
                fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.08em",
                textTransform: "uppercase", transition: "transform 0.2s, box-shadow 0.2s",
                fontFamily: "inherit",
              }}>Request Walkthrough &rarr;</button>
              <p style={{ textAlign: "center", fontSize: 12, color: "rgba(230,237,243,0.35)", margin: 0 }}>
                No commitment. No credit card. 30-minute session with an actual steel project engineer — not a sales rep.
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
              The project delivery platform for structural steel fabricators and erectors. Built in Phoenix, AZ by people who've run steel projects.
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
          <span style={{ fontSize: 12, color: "rgba(230,237,243,0.3)" }}>&copy; {new Date().getFullYear()} SteelBuild Pro. All rights reserved.</span>
          <span style={{ fontSize: 12, color: "rgba(230,237,243,0.3)" }}>Phoenix, AZ &middot; Built for structural steel contractors nationwide</span>
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
            }}>{"✕"}</button>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#C89B20", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>STEELBUILD PRO</div>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 28, margin: "0 0 6px" }}>Sign In</h2>
              <p style={{ fontSize: 13, color: "rgba(230,237,243,0.45)", margin: 0 }}>Access your projects and data.</p>
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
