/**
 * Landing — public marketing page for steelbuild-pro.com.
 *
 * Industrial-executive redesign: a calm, professional "steel shop drawing"
 * aesthetic — warm ivory paper, near-black ink, a single muted-gold accent,
 * graphite linework, Space Grotesk (medium) headings, restrained mono labels,
 * and drafting cues (blueprint grid, registration ticks, dimension lines,
 * a title-block strip). Intentionally lighter/quieter than the dark in-app
 * chrome. See docs/superpowers/specs/2026-06-15-landing-redesign-design.md.
 *
 * Sections:
 *   Nav → Hero → Pain Points → Stats → Features → Workflow →
 *   Differentiator → Demo CTA → Title block → Footer
 *
 * Receives `onLogin`, `isSubmitting`, and `loginError` from AuthenticatedApp
 * so the sign-in modal works without leaving the page.
 *
 * The page always renders in the executive light design regardless of the
 * app's theme default; the root element paints an opaque ivory background to
 * cover the app's `.steelbuild-dark` aurora.
 */

import React, { useState, useRef, useEffect } from "react";

/* ─── Palette + fonts ─────────────────────────────────────────── */

const C = {
  paper: "#FBFAF7", surface: "#FFFFFF", band: "#F3F1EA",
  ink: "#17191C", ink2: "#3C424A", muted: "#727983",
  line: "#E5E1D5", line2: "#ECEDEF", graphite: "#2A2E35",
  gold: "#9A7B1E", goldB: "#B8860B", steel: "#1C2430", clay: "#A6422E",
  track: "#EDEAE1", grayBar: "#9BA1A9", grayBarLow: "#CFD3D8",
};
const F = {
  disp: "'Space Grotesk', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

/* ─── Data ────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Platform", target: "features" },
  { label: "Workflow", target: "workflow" },
  { label: "Why steel", target: "why" },
  { label: "Contact", target: "demo" },
];

const PAIN_POINTS = [
  { tag: "GAP 01", title: "Mill certs buried in an inbox", body: "Your CWI needs the MTR for W14×90 heat 84726 — but it's a forwarded email from three weeks ago, and nobody knows which attachment is current." },
  { tag: "GAP 02", title: "Field photos with no context", body: "200 bolt-up photos on a foreman's phone. No piece marks, no grid lines, no connection IDs. Useless for the turnover package." },
  { tag: "GAP 03", title: "RFIs in spreadsheet purgatory", body: "The log is 14 tabs deep. The GC says they answered RFI-047 Tuesday. Your PM never got it. The EOR is waiting on both." },
  { tag: "GAP 04", title: "Drawings marked up on paper", body: "The detailer sent Rev. C, but the shop floor is fabricating Rev. B. The approval stamp lives in a folder called “FINAL_FINAL_v2.”" },
  { tag: "GAP 05", title: "NCRs on sticky notes", body: "A flange was welded on the wrong side. The welder knows. The foreman knows. The NCR won't exist until someone writes it up — if ever." },
  { tag: "GAP 06", title: "Change orders you can't prove", body: "The GC added 47 embed plates outside the original scope. The email's somewhere. Good luck finding it when they dispute the CO." },
];

const STATS = [
  { value: "3.2×", label: "Faster RFI cycles", detail: "12-day avg → under 4" },
  { value: "100%", label: "MTR traceability", detail: "Heat # → piece mark → grid" },
  { value: "67%", label: "Less admin time", detail: "Manage steel, not spreadsheets" },
  { value: "0", label: "Lost close-out docs", detail: "Digital turnover, every time" },
];

const ICONS = {
  ibeam: ["M4 5h16M4 19h16M12 5v14"],
  frame: ["M4 20V8M20 20V8M3 8h18M3 20h18"],
  shield: ["M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z", "M9 12l2 2 4-4"],
  sheet: ["M7 3h7l4 4v14H7zM14 3v4h4M10 12h6M10 16h6"],
  cost: ["M4 20h16M7 20v-6M12 20v-9M17 20v-12"],
  gantt: ["M4 5v14M6 8h9M6 13h11M6 18h6"],
};

const FEATURES = [
  { num: "01", tag: "Shop", icon: ICONS.ibeam, title: "Fabrication tracking", body: "Every piece from detailing through CNC, fit-up, welding, coating, and load-out. Weld maps, NDT, and DFTs linked to piece marks.", details: ["CNC file management & nesting", "Weld procedure tracking (WPS/PQR)", "Coating & DFT inspection logs"] },
  { num: "02", tag: "Field", icon: ICONS.frame, title: "Erection management", body: "Erection sequences, crane pick plans, and bolt-up logs tied to the model. Know what's shaken out, plumbed, and punched.", details: ["Shake-out & plumb-up tracking", "High-strength bolt inspection", "Crane pick planning"] },
  { num: "03", tag: "Quality", icon: ICONS.shield, title: "QA/QC & inspections", body: "CWI reports, torque logs, and weld records with geo-tagged photos linked to connection IDs. Turnover builds as you go.", details: ["AWS D1.1 / D1.8 compliance", "Torque & tension logs", "Automated turnover assembly"] },
  { num: "04", tag: "Documents", icon: ICONS.sheet, title: "Drawing & submittal control", body: "Version-controlled drawing sets with automated approval routing. AI extracts piece marks and quantities from submittals.", details: ["Automatic revision control", "AI drawing data extraction", "Mark-up overlay comparison"] },
  { num: "05", tag: "Commercial", icon: ICONS.cost, title: "Commercial & cost control", body: "SOV progress tied to actual field completion. Change-order backup assembled from RFIs, drawing deltas, and field directives.", details: ["SOV linked to erection progress", "Change-order evidence packaging", "Cost code by work package"] },
  { num: "06", tag: "Schedule", icon: ICONS.gantt, title: "Schedule & risk intelligence", body: "Gantt logic built for steel delivery. AI flags when a late approval will cascade into an erection delay — before it happens.", details: ["Steel-specific milestones", "Approval-to-fab lead tracking", "Critical-path risk alerts"] },
];

const WORKFLOW = [
  { n: "1", title: "Award → detailing", body: "Import scope, set up drawing sets, assign detailers. Submittal packages route automatically.", milestone: "Submittals out" },
  { n: "2", title: "Shop → fab", body: "Approved drawings release to CNC. Track every piece through fit-up, welding, NDT, and coating.", milestone: "Load-out ready" },
  { n: "3", title: "Delivery → erection", body: "Shipping tickets match to erection sequences. Crews log shake-out, plumb-up, and bolt-up with photos.", milestone: "Topped out" },
  { n: "4", title: "Punch → close-out", body: "Punch lists, final inspections, and as-builts flow into a sealed turnover package. One deliverable.", milestone: "Turnover complete" },
];

const DIFFERENTIATORS = [
  { label: "Piece-mark tracking", sub: "Not generic tasks" },
  { label: "Connection-based QC", sub: "Not punchlists" },
  { label: "Heat-number trace", sub: "Not just material logs" },
  { label: "Erection sequence", sub: "Not Gantt-only" },
];

const TITLE_BLOCK = [
  { k: "Project", v: "Steel delivery platform" },
  { k: "Discipline", v: "Structural steel" },
  { k: "Scope", v: "Detailing → turnover" },
  { k: "Rev", v: "2026.06" },
  { k: "Sheet", v: "01 / 01" },
];

const STAGE_BARS = [
  { label: "Detailing", pct: 100, color: C.gold, valueColor: C.ink },
  { label: "Fabrication", pct: 89, color: C.grayBar, valueColor: C.ink },
  { label: "Erection", pct: 62, color: C.grayBar, valueColor: C.ink },
  { label: "Close-out", pct: 15, color: C.grayBarLow, valueColor: C.muted },
];

/* ─── Small presentational helpers ────────────────────────────── */

const monoLabel = (extra = {}) => ({
  fontFamily: F.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.12em",
  textTransform: "uppercase", color: C.muted, ...extra,
});

function FeatureIcon({ paths }) {
  return (
    <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* ─── Component ───────────────────────────────────────────────── */

export default function Landing({ onLogin, isSubmitting, loginError }) {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "", tonnage: "", message: "" });
  const [demoSent, setDemoSent] = useState(false);

  const sectionRefs = {
    features: useRef(null),
    workflow: useRef(null),
    why: useRef(null),
    demo: useRef(null),
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The landing is a full-screen light takeover; paint the page (html/body)
  // ivory while mounted so the scrollbar gutter doesn't show the app's dark
  // `.steelbuild-dark` base color. Restored on unmount so the dark app chrome
  // is untouched after sign-in.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = C.paper;
    body.style.background = C.paper;
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
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
    setDemoSent(true);
  };

  return (
    <div style={{
      background: C.paper,
      backgroundImage: "linear-gradient(rgba(23,25,28,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,28,0.035) 1px, transparent 1px)",
      backgroundSize: "30px 30px",
      color: C.ink2, minHeight: "100vh", fontFamily: F.body, overflowX: "hidden",
    }}>
      <style>{`
        @keyframes lpFade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .lp-fade { animation: lpFade 0.6s ease both; }
        .lp-wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px; }
        .lp-sec { padding: 100px 0; }
        .lp-onwhite { background: ${C.surface}; }
        .lp-eyebrow { font-family: ${F.mono}; font-size: 11px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: ${C.gold}; display: inline-flex; align-items: center; gap: 10px; }
        .lp-eyebrow::before { content: ""; width: 22px; height: 1.5px; background: ${C.gold}; display: inline-block; }
        .lp-ic { width: 24px; height: 24px; stroke: ${C.graphite}; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .lp-card { background: ${C.surface}; border: 1px solid ${C.line}; border-radius: 12px; padding: 26px; transition: border-color 0.18s, box-shadow 0.18s; }
        .lp-card-hover:hover { border-color: #D8D2C2; box-shadow: 0 1px 2px rgba(20,22,26,0.04), 0 14px 32px -20px rgba(20,22,26,0.18); }
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: ${F.body}; font-size: 14px; font-weight: 500; padding: 13px 24px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: background 0.15s, border-color 0.15s, opacity 0.15s; }
        .lp-btn-primary { background: ${C.steel}; color: #fff; }
        .lp-btn-primary:hover { background: #11161F; }
        .lp-btn-ghost { background: transparent; color: ${C.ink}; border-color: ${C.line}; }
        .lp-btn-ghost:hover { border-color: #D7D2C4; background: #fff; }
        .lp-navlink { background: none; border: none; font-family: ${F.body}; font-size: 14px; color: ${C.ink2}; font-weight: 500; cursor: pointer; padding: 0; transition: color 0.15s; }
        .lp-navlink:hover { color: ${C.ink}; }
        .lp-goldbar { width: 26px; height: 2px; background: ${C.gold}; border-radius: 2px; }
        .lp-input { width: 100%; padding: 11px 13px; border: 1px solid ${C.line}; border-radius: 8px; font-family: ${F.body}; font-size: 14px; color: ${C.ink}; background: #fff; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
        .lp-input:focus { border-color: ${C.gold}; box-shadow: 0 0 0 3px rgba(154,123,30,0.14); }
        .lp-input::placeholder { color: ${C.muted}; }
        .lp-cap { display: flex; gap: 10px; align-items: baseline; margin-top: 9px; }
        .lp-cap::before { content: "—"; color: ${C.gold}; font-size: 13px; flex-shrink: 0; }
        .lp-track { height: 5px; background: ${C.track}; border-radius: 3px; overflow: hidden; }
        .lp-reg { position: relative; }
        .lp-reg::before, .lp-reg::after { content: ""; position: absolute; width: 11px; height: 11px; border-color: ${C.gold}; border-style: solid; }
        .lp-reg::before { top: 9px; left: 9px; border-width: 1.5px 0 0 1.5px; }
        .lp-reg::after { bottom: 9px; right: 9px; border-width: 0 1.5px 1.5px 0; }
        .lp-dim { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
        .lp-dim .ln { flex: 1; height: 1px; background: ${C.graphite}; opacity: 0.5; position: relative; }
        .lp-dim .ln::before, .lp-dim .ln::after { content: ""; position: absolute; top: -3px; width: 1px; height: 7px; background: ${C.graphite}; }
        .lp-dim .ln::before { left: 0; } .lp-dim .ln::after { right: 0; }
        .lp-specrow { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1.5px solid ${C.graphite}; border-bottom: 1.5px solid ${C.graphite}; }
        .lp-speccell { padding: 30px 26px; }
        .lp-speccell + .lp-speccell { border-left: 1px solid ${C.line}; }
        .lp-titleblock { display: flex; border: 1.5px solid ${C.graphite}; }
        .lp-tb { flex: 1; padding: 12px 16px; }
        .lp-tb + .lp-tb { border-left: 1px solid ${C.line}; }
        .lp-overlay { position: fixed; inset: 0; background: rgba(20,22,26,0.5); backdrop-filter: blur(6px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .lp-mobile-toggle { display: none; background: none; border: none; color: ${C.ink}; font-size: 24px; cursor: pointer; padding: 4px; }
        @media (max-width: 940px) {
          .lp-hero { grid-template-columns: 1fr !important; gap: 44px !important; }
          .lp-demo { grid-template-columns: 1fr !important; }
          .lp-c3 { grid-template-columns: 1fr 1fr !important; }
          .lp-c4 { grid-template-columns: 1fr 1fr !important; }
          .lp-nav-links { display: none !important; }
          .lp-mobile-toggle { display: inline-flex !important; }
          .lp-footer { flex-direction: column !important; gap: 28px !important; }
        }
        @media (max-width: 620px) {
          .lp-wrap { padding: 0 20px; }
          .lp-sec { padding: 64px 0 !important; }
          .lp-c2, .lp-c3, .lp-c4 { grid-template-columns: 1fr !important; }
          .lp-specrow { grid-template-columns: 1fr 1fr !important; }
          .lp-specrow .lp-speccell:nth-child(odd) { border-left: 0 !important; }
          .lp-specrow .lp-speccell:nth-child(n+3) { border-top: 1px solid ${C.line} !important; }
          .lp-speccell { padding: 24px 18px !important; }
          .lp-titleblock { flex-wrap: wrap !important; }
          .lp-tb { flex: 1 0 45% !important; border-top: 1px solid ${C.line}; }
        }
      `}</style>

      {/* ══ top edge ══ */}
      <div style={{ height: 3, background: C.gold }} />
      <div style={{ height: 1, background: C.graphite, opacity: 0.25 }} />

      {/* ══ NAV ══ */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? "rgba(251,250,247,0.92)" : "rgba(251,250,247,0.86)",
        backdropFilter: "blur(10px)",
        borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
        transition: "border-color 0.2s, background 0.2s",
      }}>
        <div className="lp-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 7, background: C.steel, display: "grid", placeItems: "center", color: C.goldB, fontFamily: F.disp, fontWeight: 600, fontSize: 13, letterSpacing: "0.03em" }}>SB</div>
            <span style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 15, letterSpacing: "0.14em", color: C.ink }}>STEELBUILD&nbsp;PRO</span>
          </div>
          <div className="lp-nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {NAV_LINKS.map(({ label, target }) => (
              <button key={target} className="lp-navlink" onClick={() => scrollTo(target)}>{label}</button>
            ))}
            <button className="lp-navlink" style={{ color: C.ink }} onClick={() => setShowLogin(true)}>Sign in</button>
            <button className="lp-btn lp-btn-primary" onClick={() => scrollTo("demo")}>Request a demo</button>
          </div>
          <button className="lp-mobile-toggle" aria-label={mobileNav ? "Close menu" : "Open menu"} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? "✕" : "☰"}</button>
        </div>

        {mobileNav && (
          <div className="lp-wrap" style={{ paddingTop: 12, paddingBottom: 18, display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${C.line}` }}>
            {NAV_LINKS.map(({ label, target }) => (
              <button key={target} className="lp-navlink" style={{ textAlign: "left", fontSize: 15 }} onClick={() => scrollTo(target)}>{label}</button>
            ))}
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button className="lp-btn lp-btn-ghost" style={{ flex: 1 }} onClick={() => { setShowLogin(true); setMobileNav(false); }}>Sign in</button>
              <button className="lp-btn lp-btn-primary" style={{ flex: 1 }} onClick={() => scrollTo("demo")}>Request a demo</button>
            </div>
          </div>
        )}
      </nav>

      {/* ══ HERO ══ */}
      <section className="lp-fade" style={{ padding: "96px 0 88px" }}>
        <div className="lp-wrap lp-hero" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 64, alignItems: "center" }}>
          <div>
            <span className="lp-eyebrow" style={{ marginBottom: 26 }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, stroke: C.gold, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M4 5h16M4 19h16M12 5v14" />
              </svg>
              Built for structural steel
            </span>
            <h1 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(38px, 5vw, 60px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: C.ink, margin: "20px 0 0" }}>
              Your steel is only as good as the system behind it.
            </h1>
            <p style={{ fontSize: 18, color: C.ink2, lineHeight: 1.6, margin: "24px 0 16px", maxWidth: 520 }}>
              From detailing approval to turnover package — every piece mark, every heat number, every weld record, in one system built for fabricators and erectors.
            </p>
            <p style={{ fontSize: 15, color: C.muted, maxWidth: 500, margin: "0 0 34px", lineHeight: 1.6 }}>
              No more chasing mill certs through email, tracking bolt-up on paper, or losing RFIs in spreadsheet tabs.
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 40 }}>
              <button className="lp-btn lp-btn-primary" style={{ padding: "14px 28px" }} onClick={() => scrollTo("demo")}>See it on your project</button>
              <button className="lp-btn lp-btn-ghost" style={{ padding: "14px 26px" }} onClick={() => scrollTo("workflow")}>Watch a 2-min tour</button>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
              <span>AISC certified</span><span style={{ color: C.line }}>/</span>
              <span>AWS D1.1</span><span style={{ color: C.line }}>/</span>
              <span>OSHA record-ready</span>
            </div>
          </div>

          {/* Calm product panel w/ drafting marks */}
          <div>
            <div className="lp-card lp-reg" style={{ padding: 24, boxShadow: "0 1px 2px rgba(20,22,26,0.04), 0 22px 48px -28px rgba(20,22,26,0.18)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                  <div style={monoLabel({ marginBottom: 5, fontSize: 11, letterSpacing: "0.14em" })}>Active project</div>
                  <div style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 18, color: C.ink }}>24426 · Capstone Medical Center</div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 3 }}>3,847 tons · 428 pieces · Phase 2 erection</div>
                </div>
                <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold, border: `1px solid ${C.line}`, padding: "4px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>On track</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, padding: "20px 0", borderTop: `1px solid ${C.line2}`, borderBottom: `1px solid ${C.line2}` }}>
                {[{ l: "Fab released", v: "89%" }, { l: "Erected", v: "62%" }, { l: "Open RFIs", v: "7" }].map(({ l, v }) => (
                  <div key={l}>
                    <div style={monoLabel({ marginBottom: 7, fontSize: 11, letterSpacing: "0.14em" })}>{l}</div>
                    <div style={{ fontFamily: F.disp, fontWeight: 500, fontSize: 30, color: C.ink, lineHeight: 1, letterSpacing: "-0.02em" }}>{v}</div>
                    <div className="lp-goldbar" style={{ marginTop: 8 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, paddingTop: 20 }}>
                {STAGE_BARS.map(({ label, pct, color, valueColor }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}</span>
                      <span style={{ fontFamily: F.mono, fontSize: 10.5, color: valueColor, fontWeight: 500 }}>{pct}%</span>
                    </div>
                    <div className="lp-track"><div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: color }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-dim"><span className="ln" /><em style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontStyle: "normal" }}>3,847 tons · 428 pieces</em><span className="ln" /></div>
          </div>
        </div>
      </section>

      {/* ══ PAIN POINTS ══ */}
      <section className="lp-sec lp-onwhite" style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The cost of gaps</span>
            <h2 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(27px, 3.3vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.ink, margin: "16px 0 0" }}>Steel projects don't fail all at once.</h2>
            <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.6, marginTop: 16 }}>They fail in a thousand small gaps — documents that can't be found, inspections that weren't recorded, evidence that doesn't exist when you need it.</p>
          </div>
          <div className="lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {PAIN_POINTS.map((p) => (
              <div key={p.tag} style={{ padding: "24px 24px 24px 22px", borderLeft: `2px solid ${C.clay}` }}>
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.14em", color: C.clay, marginBottom: 9 }}>{p.tag}</div>
                <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 9px" }}>{p.title}</h3>
                <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STATS — spec table ══ */}
      <section style={{ padding: "80px 0" }}>
        <div className="lp-wrap">
          <div className="lp-specrow">
            {STATS.map((s) => (
              <div className="lp-speccell" key={s.label}>
                <div style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(36px, 4vw, 50px)", color: C.ink, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</div>
                <div className="lp-goldbar" style={{ margin: "14px 0 12px" }} />
                <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ink, fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 5 }}>{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section ref={sectionRefs.features} className="lp-sec lp-onwhite" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The platform</span>
            <h2 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(27px, 3.3vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.ink, margin: "16px 0 0" }}>Built for steel, not adapted to it.</h2>
            <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.6, marginTop: 16 }}>Every module speaks the language of structural steel — piece marks, heat numbers, connection IDs, grid lines, erection sequences.</p>
          </div>
          <div className="lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {FEATURES.map((f) => (
              <div key={f.num} className="lp-card lp-card-hover">
                <FeatureIcon paths={f.icon} />
                <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, margin: "14px 0 8px" }}>{f.num} — {f.tag}</div>
                <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 10px" }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65, margin: 0 }}>{f.body}</p>
                <hr style={{ height: 1, background: C.line, border: 0, margin: "18px 0 14px" }} />
                {f.details.map((d) => (
                  <div key={d} className="lp-cap"><span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{d}</span></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ WORKFLOW ══ */}
      <section ref={sectionRefs.workflow} className="lp-sec">
        <div className="lp-wrap">
          <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The lifecycle</span>
            <h2 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(27px, 3.3vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.ink, margin: "16px 0 0" }}>Award to turnover. Every piece tracked.</h2>
            <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.6, marginTop: 16 }}>SteelBuild Pro follows the actual lifecycle of a steel project — not a generic plan, build, close framework.</p>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: 14, left: "12%", right: "12%", height: 1, background: C.graphite, opacity: 0.3 }} />
            <div className="lp-c4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, position: "relative" }}>
              {WORKFLOW.map((w) => (
                <div key={w.n}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.paper, border: `1.5px solid ${C.gold}`, color: C.gold, display: "grid", placeItems: "center", fontFamily: F.mono, fontSize: 12, fontWeight: 600, marginBottom: 18 }}>{w.n}</div>
                  <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", color: C.ink, margin: "0 0 9px" }}>{w.title}</h3>
                  <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, margin: "0 0 12px" }}>{w.body}</p>
                  <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>{w.milestone}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ DIFFERENTIATOR ══ */}
      <section ref={sectionRefs.why} className="lp-sec" style={{ background: C.band, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap" style={{ maxWidth: 920, textAlign: "center" }}>
          <div style={{ fontFamily: F.disp, fontSize: 52, color: C.gold, lineHeight: 0.6, marginBottom: 8 }}>{"“"}</div>
          <h2 style={{ fontFamily: F.disp, fontWeight: 400, fontSize: "clamp(24px, 3vw, 36px)", lineHeight: 1.2, letterSpacing: "-0.02em", color: C.ink, margin: 0 }}>
            We tried Procore. We tried Fieldwire.<br />Neither one speaks steel.
          </h2>
          <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.6, maxWidth: 680, margin: "24px auto 44px" }}>
            General construction software forces steel contractors into workarounds. SteelBuild Pro was designed from day one for how structural steel actually works.
          </p>
          <div className="lp-c4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, textAlign: "left" }}>
            {DIFFERENTIATORS.map((d) => (
              <div key={d.label}>
                <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>{d.label}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{d.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEMO CTA ══ */}
      <section ref={sectionRefs.demo} className="lp-sec lp-onwhite">
        <div className="lp-wrap lp-demo" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 56, alignItems: "center" }}>
          <div>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>See it with your data</span>
            <h2 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: "clamp(27px, 3.3vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.02em", color: C.ink, margin: "16px 0 0" }}>Put your worst project in it.</h2>
            <p style={{ fontSize: 18, color: C.ink2, lineHeight: 1.6, margin: "18px 0 24px" }}>
              Bring the job with the 14-tab RFI log and the missing mill certs. We'll show you what it looks like when every piece, document, and inspection lives in one system.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["A walkthrough with a steel PM, not a sales rep", "Set up on one of your real projects", "No credit card, no long-term commitment"].map((t) => (
                <div key={t} style={{ display: "flex", gap: 11, alignItems: "center" }}>
                  <span className="lp-goldbar" style={{ width: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, color: C.ink2 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {demoSent ? (
            <div className="lp-card" style={{ padding: 40, textAlign: "center", borderColor: C.gold }}>
              <div style={{ fontFamily: F.disp, fontWeight: 500, fontSize: 24, color: C.ink, marginBottom: 8 }}>Request received.</div>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, margin: 0 }}>We'll reach out within one business day to schedule your walkthrough.</p>
            </div>
          ) : (
            <form className="lp-card" onSubmit={handleDemoSubmit} style={{ padding: 30 }}>
              <div className="lp-c2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={monoLabel({ display: "block", marginBottom: 7 })}>Name</label>
                  <input className="lp-input" type="text" placeholder="Jane Foreman" value={demoForm.name} onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })} required />
                </div>
                <div>
                  <label style={monoLabel({ display: "block", marginBottom: 7 })}>Work email</label>
                  <input className="lp-input" type="email" placeholder="jane@fabshop.com" value={demoForm.email} onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })} required />
                </div>
                <div>
                  <label style={monoLabel({ display: "block", marginBottom: 7 })}>Company</label>
                  <input className="lp-input" type="text" placeholder="Acme Steel" value={demoForm.company} onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })} required />
                </div>
                <div>
                  <label style={monoLabel({ display: "block", marginBottom: 7 })}>Annual tonnage</label>
                  <input className="lp-input" type="text" placeholder="8,000" value={demoForm.tonnage} onChange={(e) => setDemoForm({ ...demoForm, tonnage: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={monoLabel({ display: "block", marginBottom: 7 })}>What's hurting right now?</label>
                <textarea className="lp-input" rows={3} placeholder="RFIs, submittals, close-out docs…" value={demoForm.message} onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })} style={{ resize: "vertical" }} />
              </div>
              <button className="lp-btn lp-btn-primary" type="submit" style={{ width: "100%", padding: 14 }}>Request my walkthrough</button>
            </form>
          )}
        </div>
      </section>

      {/* ══ TITLE BLOCK ══ */}
      <section style={{ padding: "48px 0 64px" }}>
        <div className="lp-wrap">
          <div className="lp-titleblock">
            {TITLE_BLOCK.map(({ k, v }) => (
              <div className="lp-tb" key={k}>
                <span style={{ display: "block", fontFamily: F.mono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>{k}</span>
                <strong style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 500, color: C.ink, letterSpacing: "0.02em" }}>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: "#16191F", padding: "56px 0 36px" }}>
        <div className="lp-wrap lp-footer" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 32 }}>
          <div style={{ maxWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 7, background: "#222730", display: "grid", placeItems: "center", color: C.goldB, fontFamily: F.disp, fontWeight: 600, fontSize: 13 }}>SB</div>
              <span style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 15, letterSpacing: "0.14em", color: "#fff" }}>STEELBUILD PRO</span>
            </div>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>The project delivery platform built for structural steel fabricators and erectors.</p>
          </div>
          <div style={{ display: "flex", gap: 64, flexWrap: "wrap" }}>
            {[
              { head: "Platform", links: [["Modules", "features"], ["Workflow", "workflow"], ["Integrations", "features"]] },
              { head: "Company", links: [["About", "why"], ["Contact", "demo"], ["Request a demo", "demo"]] },
            ].map((col) => (
              <div key={col.head}>
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.goldB, marginBottom: 14 }}>{col.head}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(([label, target]) => (
                    <button key={label} onClick={() => scrollTo(target)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: F.body, fontSize: 13.5, color: "rgba(255,255,255,0.6)" }}>{label}</button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.goldB, marginBottom: 14 }}>Legal</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["Privacy", "Terms", "Security"].map((l) => (
                  <span key={l} style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)" }}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="lp-wrap" style={{ marginTop: 40, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>© {new Date().getFullYear()} SteelBuild Pro</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Built by steel people, for steel people.</span>
        </div>
      </footer>

      {/* ══ SIGN IN MODAL ══ */}
      {showLogin && (
        <div className="lp-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Sign in" style={{ width: "100%", maxWidth: 420, padding: 32, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 32px 80px rgba(20,22,26,0.35)", position: "relative" }}>
            <button onClick={() => setShowLogin(false)} aria-label="Close sign in" style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 500, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>STEELBUILD PRO</div>
              <h2 style={{ fontFamily: F.disp, fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", color: C.ink, margin: "0 0 6px" }}>Sign in</h2>
              <p style={{ fontSize: 13.5, color: C.muted, margin: 0 }}>Access your projects and data.</p>
            </div>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={monoLabel({ display: "block", marginBottom: 6 })}>Email</label>
                <input className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={monoLabel({ display: "block", marginBottom: 6 })}>Password</label>
                <input className="lp-input" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {loginError && (
                <div style={{ padding: "10px 14px", background: "rgba(166,66,46,0.08)", border: `1px solid ${C.clay}`, borderRadius: 8, fontSize: 13, color: C.clay }}>{loginError}</div>
              )}
              <button type="submit" disabled={isSubmitting} className="lp-btn lp-btn-primary" style={{ width: "100%", padding: 13, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1 }}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
