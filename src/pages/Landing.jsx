/**
 * Landing — public marketing page for steelbuild-pro.com.
 *
 * "Industrial Midnight" redesign: a bold, DARK, modern-SaaS landing —
 * Linear/Vercel/Stripe-level polish with structural-steel grit. A near-black
 * steel base (#0B0E11), oversized condensed Barlow headlines, glowing
 * safety-gold accents, and the cinematic brand image featured in a dramatic
 * dark hero. This is intentionally the DARK twin of the in-app "SteelBuild
 * Dark" chrome — the cinematic brand photo finally belongs on a dark page.
 *
 * Sections:
 *   Nav → Hero → Trust/stat bar → Pain Points → Features → Workflow →
 *   Big proof band → Differentiator/quote → Pricing → Demo CTA →
 *   Final CTA → Footer
 *
 * Receives `onLogin`, `onSignUp`, `isSubmitting`, and `loginError` from
 * AuthenticatedApp so the sign-in / sign-up modal works without leaving the page.
 *
 * The page is self-contained: it paints html/body itself with the dark steel
 * base and defines its own palette/fonts. It does NOT import app theme tokens.
 */

import React, { useState, useRef, useEffect } from "react";
import { PLANS } from "@/lib/billing/plans";

/* ─── Palette + fonts (self-contained, dark) ──────────────────── */

const C = {
  // surfaces — near-black steel base, layered up to elevated cards
  base: "#0B0E11", surface: "#0F141A", card: "#161C24", cardHi: "#1B232E",
  // hairlines
  line: "rgba(255,255,255,0.07)", line2: "rgba(255,255,255,0.12)",
  // text
  ink: "#F2F4F7", body: "#AEB7C2", muted: "#727B86",
  // accent — brand safety-gold; brighter for glows/hover
  gold: "#C89B20", goldB: "#E6B53C",
  // hot secondary (used sparingly)
  ember: "#FF6A2B",
};
const F = {
  disp: "'Barlow Condensed', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

const HERO_IMG = "/steelbuild-pro-hero-industrial.png";
const LOGO_IMG = "/steelbuild-pro-logo.jpg";

/* ─── Data ────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Platform", target: "features" },
  { label: "Workflow", target: "workflow" },
  { label: "Why steel", target: "why" },
  { label: "Pricing", target: "pricing" },
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

const STAGE_BARS = [
  { label: "Detailing", pct: 100 },
  { label: "Fabrication", pct: 89 },
  { label: "Erection", pct: 62 },
  { label: "Close-out", pct: 15 },
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

/* Reveal-on-scroll: IntersectionObserver wrapper. Honors prefers-reduced-motion
   (when reduced, content is shown immediately with no transform). */
function Reveal({ children, delay = 0, as: Tag = "div", className = "", style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}

/* ─── Component ───────────────────────────────────────────────── */

export default function Landing({ onLogin, onSignUp, isSubmitting, loginError }) {
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState(null);
  const [signupNotice, setSignupNotice] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "", tonnage: "", message: "" });
  const [demoSent, setDemoSent] = useState(false);

  const sectionRefs = {
    features: useRef(null),
    workflow: useRef(null),
    why: useRef(null),
    pricing: useRef(null),
    demo: useRef(null),
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The landing is a full-screen dark takeover; paint the page (html/body) with
  // the near-black steel base while mounted so the scrollbar gutter and any
  // overscroll match the page. Restored on unmount so the app chrome is
  // untouched after sign-in.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = C.base;
    body.style.background = C.base;
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

  // Reset the sign-up notice/error each time the auth modal opens/closes.
  useEffect(() => {
    if (showLogin) { setSignupNotice(null); setSignupError(null); }
  }, [showLogin]);

  const scrollTo = (key) => {
    sectionRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNav(false);
  };

  // Open the auth modal in a specific mode ("signin" | "signup"). The "Start
  // free" CTAs jump straight to sign-up so self-serve signup isn't hidden behind
  // the Sign in button.
  const openAuth = (mode) => {
    setAuthMode(mode);
    setSignupError(null);
    setSignupNotice(null);
    setShowLogin(true);
    setMobileNav(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    await onLogin?.({ email: email.trim(), password });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignupError(null);
    if (!email.trim() || !password) return;
    if (password.length < 8) { setSignupError("Use at least 8 characters for your password."); return; }
    setSignupBusy(true);
    const res = await onSignUp?.({ email: email.trim(), password, fullName: fullName.trim() || undefined });
    setSignupBusy(false);
    if (res?.success) {
      // needsConfirmation: show the check-your-email notice. Otherwise the auth
      // state change signs them in and this whole screen unmounts.
      if (res.needsConfirmation) {
        setSignupNotice(`We sent a confirmation link to ${email.trim()}. Click it to activate your account, then sign in.`);
      }
    } else if (res?.error) {
      setSignupError(res.error.message);
    }
  };

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    setDemoSent(true);
  };

  return (
    <div style={{
      background: C.base,
      color: C.body, minHeight: "100vh", fontFamily: F.body, overflowX: "hidden",
      position: "relative",
    }}>
      <style>{`
        @keyframes lpFloat { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-14px,0); } }
        @keyframes lpGlow { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }
        @keyframes lpScan { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }

        .lp-reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
        .lp-reveal.is-in { opacity: 1; transform: translateY(0); }

        .lp-wrap { max-width: 1160px; margin: 0 auto; padding: 0 32px; position: relative; }
        .lp-sec { padding: 112px 0; position: relative; }

        .lp-eyebrow { font-family: ${F.mono}; font-size: 11px; font-weight: 500; letter-spacing: 0.24em; text-transform: uppercase; color: ${C.goldB}; display: inline-flex; align-items: center; gap: 11px; }
        .lp-eyebrow::before { content: ""; width: 26px; height: 1.5px; background: linear-gradient(90deg, transparent, ${C.gold}); display: inline-block; }

        .lp-h2 { font-family: ${F.disp}; font-weight: 700; font-size: clamp(34px, 5vw, 60px); line-height: 1.0; letter-spacing: 0.005em; text-transform: uppercase; color: ${C.ink}; margin: 18px 0 0; }
        .lp-sub { font-size: 17px; color: ${C.body}; line-height: 1.65; margin-top: 18px; }

        .lp-ic { width: 26px; height: 26px; stroke: ${C.goldB}; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

        .lp-card { background: linear-gradient(180deg, ${C.card}, ${C.surface}); border: 1px solid ${C.line}; border-radius: 14px; padding: 28px; transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), border-color 0.22s, box-shadow 0.22s; }
        .lp-card-hover { position: relative; }
        .lp-card-hover:hover { transform: translateY(-6px); border-color: rgba(230,181,60,0.45); box-shadow: 0 0 0 1px rgba(230,181,60,0.12), 0 22px 50px -28px rgba(0,0,0,0.9), 0 0 44px -18px rgba(230,181,60,0.35); }

        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: ${F.body}; font-size: 14px; font-weight: 600; padding: 13px 24px; border-radius: 9px; cursor: pointer; border: 1px solid transparent; transition: transform 0.16s, background 0.16s, border-color 0.16s, box-shadow 0.16s, opacity 0.16s; letter-spacing: 0.01em; }
        .lp-btn-primary { background: linear-gradient(180deg, ${C.goldB}, ${C.gold}); color: #1A1306; box-shadow: 0 0 0 1px rgba(230,181,60,0.4), 0 10px 30px -10px rgba(200,155,32,0.6); }
        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(230,181,60,0.6), 0 16px 40px -10px rgba(230,181,60,0.7); }
        .lp-btn-ghost { background: rgba(255,255,255,0.02); color: ${C.ink}; border-color: ${C.line2}; }
        .lp-btn-ghost:hover { transform: translateY(-2px); border-color: rgba(230,181,60,0.5); background: rgba(230,181,60,0.06); }

        .lp-navlink { background: none; border: none; font-family: ${F.body}; font-size: 14px; color: ${C.body}; font-weight: 500; cursor: pointer; padding: 6px 2px; transition: color 0.15s; }
        .lp-navlink:hover { color: ${C.ink}; }

        .lp-goldbar { width: 28px; height: 2px; background: linear-gradient(90deg, ${C.goldB}, ${C.gold}); border-radius: 2px; box-shadow: 0 0 10px rgba(230,181,60,0.5); }

        .lp-input { width: 100%; padding: 12px 13px; border: 1px solid ${C.line2}; border-radius: 9px; font-family: ${F.body}; font-size: 14px; color: ${C.ink}; background: rgba(11,14,17,0.6); outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
        .lp-input:focus { border-color: ${C.goldB}; box-shadow: 0 0 0 3px rgba(230,181,60,0.18); }
        .lp-input::placeholder { color: ${C.muted}; }

        .lp-cap { display: flex; gap: 10px; align-items: baseline; margin-top: 9px; }
        .lp-cap::before { content: "▸"; color: ${C.gold}; font-size: 11px; flex-shrink: 0; line-height: 1.5; }

        .lp-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }

        a.lp-link, .lp-footlink { background: none; border: none; padding: 0; text-align: left; cursor: pointer; font-family: ${F.body}; font-size: 13.5px; color: ${C.body}; transition: color 0.15s; }
        .lp-footlink:hover { color: ${C.goldB}; }

        .lp-overlay { position: fixed; inset: 0; background: rgba(4,6,9,0.74); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; animation: lpFadeIn 0.18s ease; }
        @keyframes lpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .lp-mobile-toggle { display: none; background: none; border: 1px solid ${C.line2}; border-radius: 8px; color: ${C.ink}; font-size: 20px; cursor: pointer; padding: 6px 10px; line-height: 1; }

        /* atmospheric glows */
        .lp-glow { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; z-index: 0; }
        .lp-blueprint { position: absolute; inset: 0; pointer-events: none; z-index: 0;
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 46px 46px; mask-image: radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 78%); -webkit-mask-image: radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 78%); }

        .lp-hero-frame { position: relative; border-radius: 18px; overflow: hidden; border: 1px solid rgba(230,181,60,0.22);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 40px 90px -40px rgba(0,0,0,0.95), 0 0 80px -30px rgba(230,181,60,0.4); }
        .lp-hero-scan { position: absolute; top: 0; bottom: 0; width: 38%; pointer-events: none;
          background: linear-gradient(100deg, transparent, rgba(230,181,60,0.10), transparent); animation: lpScan 6.5s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .lp-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
          .lp-hero-scan, .lp-glow-anim { animation: none !important; }
          .lp-btn:hover, .lp-card-hover:hover { transform: none !important; }
        }

        @media (max-width: 940px) {
          .lp-hero { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lp-demo { grid-template-columns: 1fr !important; }
          .lp-c3 { grid-template-columns: 1fr 1fr !important; }
          .lp-c4 { grid-template-columns: 1fr 1fr !important; }
          .lp-nav-links { display: none !important; }
          .lp-mobile-toggle { display: inline-flex !important; }
          .lp-footer { flex-direction: column !important; gap: 28px !important; }
          .lp-statbar { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 620px) {
          .lp-wrap { padding: 0 20px; }
          .lp-sec { padding: 72px 0 !important; }
          .lp-c2, .lp-c3, .lp-c4 { grid-template-columns: 1fr !important; }
          .lp-statbar { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* ══ top accent edge ══ */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldB}, ${C.ember})`, position: "relative", zIndex: 2 }} />

      {/* ══ NAV ══ */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? "rgba(11,14,17,0.82)" : "rgba(11,14,17,0.4)",
        backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
        transition: "border-color 0.2s, background 0.2s",
      }}>
        <div className="lp-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(150deg, ${C.cardHi}, ${C.surface})`, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center", color: C.goldB, fontFamily: F.disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.04em", boxShadow: "0 0 18px -6px rgba(230,181,60,0.5)" }}>SB</div>
            <span style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 19, letterSpacing: "0.12em", color: C.ink }}>STEELBUILD&nbsp;PRO</span>
          </div>
          <div className="lp-nav-links" style={{ display: "flex", alignItems: "center", gap: 30 }}>
            {NAV_LINKS.map(({ label, target }) => (
              <button key={target} className="lp-navlink" onClick={() => scrollTo(target)}>{label}</button>
            ))}
            <button className="lp-navlink" style={{ color: C.ink }} onClick={() => openAuth("signin")}>Sign in</button>
            <button className="lp-btn lp-btn-primary" onClick={() => openAuth("signup")}>Start free</button>
          </div>
          <button className="lp-mobile-toggle" aria-label={mobileNav ? "Close menu" : "Open menu"} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? "✕" : "☰"}</button>
        </div>

        {mobileNav && (
          <div className="lp-wrap" style={{ paddingTop: 14, paddingBottom: 20, display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${C.line}`, background: "rgba(11,14,17,0.96)" }}>
            {NAV_LINKS.map(({ label, target }) => (
              <button key={target} className="lp-navlink" style={{ textAlign: "left", fontSize: 16 }} onClick={() => scrollTo(target)}>{label}</button>
            ))}
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button className="lp-btn lp-btn-ghost" style={{ flex: 1 }} onClick={() => openAuth("signin")}>Sign in</button>
              <button className="lp-btn lp-btn-primary" style={{ flex: 1 }} onClick={() => openAuth("signup")}>Start free</button>
            </div>
          </div>
        )}
      </nav>

      {/* ══ HERO ══ */}
      <section style={{ padding: "84px 0 92px", position: "relative", overflow: "hidden" }}>
        <div className="lp-blueprint" />
        {/* atmospheric gold/ember glows behind the hero */}
        <div className="lp-glow lp-glow-anim" style={{ top: -120, left: "-6%", width: 520, height: 520, background: "radial-gradient(circle, rgba(200,155,32,0.30), transparent 65%)", animation: "lpGlow 7s ease-in-out infinite" }} />
        <div className="lp-glow" style={{ top: 80, right: "-8%", width: 460, height: 460, background: "radial-gradient(circle, rgba(255,106,43,0.16), transparent 68%)" }} />

        <div className="lp-wrap lp-hero" style={{ display: "grid", gridTemplateColumns: "1.02fr 0.98fr", gap: 60, alignItems: "center", zIndex: 1 }}>
          <Reveal>
            <span className="lp-eyebrow" style={{ marginBottom: 26 }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, stroke: C.goldB, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M4 5h16M4 19h16M12 5v14" />
              </svg>
              Built for structural steel
            </span>
            <h1 style={{ fontFamily: F.disp, fontWeight: 800, fontSize: "clamp(46px, 8vw, 96px)", lineHeight: 0.96, letterSpacing: "0.004em", textTransform: "uppercase", color: C.ink, margin: "18px 0 0" }}>
              Your steel is only as good as the{" "}
              <span style={{ background: `linear-gradient(180deg, ${C.goldB}, ${C.gold})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>system behind it.</span>
            </h1>
            <p style={{ fontSize: 19, color: C.body, lineHeight: 1.6, margin: "26px 0 14px", maxWidth: 540 }}>
              From detailing approval to turnover package — every piece mark, every heat number, every weld record, in one system built for fabricators and erectors.
            </p>
            <p style={{ fontSize: 15, color: C.muted, maxWidth: 520, margin: "0 0 34px", lineHeight: 1.6 }}>
              No more chasing mill certs through email, tracking bolt-up on paper, or losing RFIs in spreadsheet tabs.
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 38 }}>
              <button className="lp-btn lp-btn-primary" style={{ padding: "15px 30px", fontSize: 15 }} onClick={() => openAuth("signup")}>Start free</button>
              <button className="lp-btn lp-btn-ghost" style={{ padding: "15px 28px", fontSize: 15 }} onClick={() => scrollTo("demo")}>Request a demo</button>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontFamily: F.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
              <span>AISC certified</span><span style={{ color: C.line2 }}>/</span>
              <span>AWS D1.1</span><span style={{ color: C.line2 }}>/</span>
              <span>OSHA record-ready</span>
            </div>
          </Reveal>

          {/* The brand image — the hero's cinematic centerpiece, framed with a
              gold edge-glow and a slow light-sweep so it reads as premium, not
              a hard rectangle. Falls back to the logo if the hero asset is
              missing. */}
          <Reveal delay={120} style={{ position: "relative" }}>
            <div className="lp-hero-frame" style={{ animation: "lpFloat 9s ease-in-out infinite" }}>
              <img
                src={HERO_IMG}
                alt="SteelBuild Pro — structural steel fabrication command center"
                onError={(e) => { if (e.currentTarget.src.indexOf(LOGO_IMG) === -1) e.currentTarget.src = LOGO_IMG; }}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              {/* gradient bleeds so the photo melts into the dark page on every edge */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(11,14,17,0.30) 0%, transparent 22%, transparent 70%, rgba(11,14,17,0.55) 100%)" }} />
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(11,14,17,0.5) 100%)" }} />
              <div className="lp-hero-scan" />
            </div>

            {/* floating spec chips overlapping the frame for depth */}
            <div style={{ position: "absolute", left: -14, bottom: 26, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(15,20,26,0.86)", border: `1px solid ${C.line2}`, borderRadius: 10, padding: "9px 13px", backdropFilter: "blur(8px)", boxShadow: "0 16px 34px -20px rgba(0,0,0,0.9)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.goldB, boxShadow: `0 0 10px ${C.goldB}` }} />
                <span style={{ fontFamily: F.mono, fontSize: 11, color: C.ink, letterSpacing: "0.04em" }}>3,847 tons · 428 pieces</span>
              </div>
            </div>
            <div style={{ position: "absolute", right: -12, top: 22, background: "rgba(15,20,26,0.86)", border: `1px solid ${C.line2}`, borderRadius: 10, padding: "9px 13px", backdropFilter: "blur(8px)", boxShadow: "0 16px 34px -20px rgba(0,0,0,0.9)" }}>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>Phase 2 erection</div>
              <div style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 22, color: C.goldB, lineHeight: 1 }}>62% <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>topped out</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ TRUST / STAT BAR ══ */}
      <section style={{ padding: "0 0 8px", position: "relative", zIndex: 1 }}>
        <div className="lp-wrap">
          <Reveal className="lp-statbar" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            {STATS.map((s) => (
              <div key={s.label} style={{ background: C.surface, padding: "30px 26px" }}>
                <div style={{ fontFamily: F.disp, fontWeight: 700, fontSize: "clamp(38px, 4.4vw, 54px)", color: C.ink, lineHeight: 1, letterSpacing: "0.01em" }}>{s.value}</div>
                <div className="lp-goldbar" style={{ margin: "14px 0 12px" }} />
                <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.goldB, fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{s.detail}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ══ PAIN POINTS ══ */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal style={{ textAlign: "center", maxWidth: 700, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The cost of gaps</span>
            <h2 className="lp-h2">Steel projects don't fail all at once.</h2>
            <p className="lp-sub" style={{ color: C.muted }}>They fail in a thousand small gaps — documents that can't be found, inspections that weren't recorded, evidence that doesn't exist when you need it.</p>
          </Reveal>
          <div className="lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.tag} delay={(i % 3) * 80}>
                <div className="lp-card lp-card-hover" style={{ height: "100%", borderLeft: `2px solid ${C.ember}` }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.16em", color: C.ember, marginBottom: 11 }}>{p.tag}</div>
                  <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 22, letterSpacing: "0.01em", color: C.ink, margin: "0 0 9px", textTransform: "uppercase" }}>{p.title}</h3>
                  <p style={{ fontSize: 14, color: C.body, lineHeight: 1.65, margin: 0 }}>{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section ref={sectionRefs.features} className="lp-sec" style={{ background: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <Reveal style={{ textAlign: "center", maxWidth: 700, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The platform</span>
            <h2 className="lp-h2">Built for steel, not adapted to it.</h2>
            <p className="lp-sub" style={{ color: C.muted }}>Every module speaks the language of structural steel — piece marks, heat numbers, connection IDs, grid lines, erection sequences.</p>
          </Reveal>
          <div className="lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.num} delay={(i % 3) * 80}>
                <div className="lp-card lp-card-hover" style={{ height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ width: 50, height: 50, borderRadius: 12, background: "rgba(230,181,60,0.08)", border: `1px solid rgba(230,181,60,0.2)`, display: "grid", placeItems: "center" }}>
                      <FeatureIcon paths={f.icon} />
                    </div>
                    <span style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 30, color: "rgba(255,255,255,0.08)", lineHeight: 1 }}>{f.num}</span>
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.goldB, margin: "18px 0 8px" }}>{f.tag}</div>
                  <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 25, letterSpacing: "0.01em", color: C.ink, margin: "0 0 10px", textTransform: "uppercase" }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: C.body, lineHeight: 1.65, margin: 0 }}>{f.body}</p>
                  <hr style={{ height: 1, background: C.line, border: 0, margin: "18px 0 14px" }} />
                  {f.details.map((d) => (
                    <div key={d} className="lp-cap"><span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{d}</span></div>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ WORKFLOW ══ */}
      <section ref={sectionRefs.workflow} className="lp-sec" style={{ position: "relative", overflow: "hidden" }}>
        <div className="lp-glow" style={{ bottom: -160, left: "30%", width: 560, height: 360, background: "radial-gradient(circle, rgba(200,155,32,0.12), transparent 70%)" }} />
        <div className="lp-wrap" style={{ position: "relative", zIndex: 1 }}>
          <Reveal style={{ textAlign: "center", maxWidth: 700, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>The lifecycle</span>
            <h2 className="lp-h2">Detailing → Shop → Field → Turnover.</h2>
            <p className="lp-sub" style={{ color: C.muted }}>SteelBuild Pro follows the actual lifecycle of a steel project — not a generic plan, build, close framework. Every piece tracked, every stage handed off cleanly.</p>
          </Reveal>
          <div style={{ position: "relative" }}>
            {/* connecting rail with a gold gradient */}
            <div style={{ position: "absolute", top: 19, left: "11%", right: "11%", height: 2, background: `linear-gradient(90deg, ${C.gold}, rgba(230,181,60,0.25))`, boxShadow: "0 0 14px rgba(230,181,60,0.4)" }} />
            <div className="lp-c4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22, position: "relative" }}>
              {WORKFLOW.map((w, i) => (
                <Reveal key={w.n} delay={i * 110}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(150deg, ${C.cardHi}, ${C.surface})`, border: `1.5px solid ${C.goldB}`, color: C.goldB, display: "grid", placeItems: "center", fontFamily: F.disp, fontSize: 18, fontWeight: 700, marginBottom: 20, boxShadow: "0 0 22px -6px rgba(230,181,60,0.6)" }}>{w.n}</div>
                  <h3 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 23, letterSpacing: "0.01em", color: C.ink, margin: "0 0 9px", textTransform: "uppercase" }}>{w.title}</h3>
                  <p style={{ fontSize: 13.5, color: C.body, lineHeight: 1.6, margin: "0 0 12px" }}>{w.body}</p>
                  <div style={{ display: "inline-flex", fontFamily: F.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.goldB, border: `1px solid rgba(230,181,60,0.28)`, borderRadius: 6, padding: "5px 10px" }}>{w.milestone}</div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* live stage progress strip — concrete proof of the pipeline */}
          <Reveal delay={120} style={{ marginTop: 64 }}>
            <div className="lp-card" style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 22, color: C.ink, textTransform: "uppercase", letterSpacing: "0.01em" }}>24426 · Capstone Medical Center</div>
                <span style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.goldB, border: `1px solid rgba(230,181,60,0.3)`, padding: "5px 11px", borderRadius: 6 }}>On track</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {STAGE_BARS.map(({ label, pct }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.body }}>{label}</span>
                      <span style={{ fontFamily: F.mono, fontSize: 11, color: pct < 30 ? C.muted : C.goldB, fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div className="lp-track"><div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: pct < 30 ? "rgba(255,255,255,0.18)" : `linear-gradient(90deg, ${C.gold}, ${C.goldB})`, boxShadow: pct < 30 ? "none" : "0 0 12px rgba(230,181,60,0.5)" }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ BIG PROOF BAND ══ */}
      <section style={{ padding: "96px 0", background: `linear-gradient(180deg, ${C.surface}, ${C.base})`, borderTop: `1px solid ${C.line}`, position: "relative", overflow: "hidden" }}>
        <div className="lp-glow" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 300, background: "radial-gradient(circle, rgba(200,155,32,0.14), transparent 70%)" }} />
        <div className="lp-wrap" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <Reveal>
            <span className="lp-eyebrow" style={{ marginBottom: 22, justifyContent: "center" }}>By the numbers</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginTop: 12 }} className="lp-c3">
              {[
                { v: "3.2×", l: "Faster RFI resolution" },
                { v: "100%", l: "Heat-number traceability" },
                { v: "1", l: "Sealed turnover package" },
              ].map((s) => (
                <div key={s.l}>
                  <div style={{ fontFamily: F.disp, fontWeight: 800, fontSize: "clamp(56px, 9vw, 110px)", lineHeight: 0.92, background: `linear-gradient(180deg, ${C.goldB}, ${C.gold})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", letterSpacing: "0.01em" }}>{s.v}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.body, marginTop: 12 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ DIFFERENTIATOR / QUOTE ══ */}
      <section ref={sectionRefs.why} className="lp-sec" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="lp-wrap" style={{ maxWidth: 960, textAlign: "center" }}>
          <Reveal>
            <div style={{ fontFamily: F.disp, fontWeight: 800, fontSize: 80, color: C.gold, lineHeight: 0.5, marginBottom: 18, opacity: 0.7 }}>{"“"}</div>
            <h2 style={{ fontFamily: F.disp, fontWeight: 600, fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.05, letterSpacing: "0.005em", color: C.ink, margin: 0, textTransform: "uppercase" }}>
              We tried Procore. We tried Fieldwire.<br />
              <span style={{ color: C.goldB }}>Neither one speaks steel.</span>
            </h2>
            <p style={{ fontSize: 18, color: C.muted, lineHeight: 1.65, maxWidth: 700, margin: "26px auto 48px" }}>
              General construction software forces steel contractors into workarounds. SteelBuild Pro was designed from day one for how structural steel actually works.
            </p>
          </Reveal>
          <div className="lp-c4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, textAlign: "left" }}>
            {DIFFERENTIATORS.map((d, i) => (
              <Reveal key={d.label} delay={i * 80}>
                <div style={{ padding: "20px 20px", borderTop: `2px solid ${C.gold}`, background: C.card, border: `1px solid ${C.line}`, borderTopColor: C.gold, borderTopWidth: 2, borderRadius: "0 0 12px 12px", height: "100%" }}>
                  <div style={{ fontFamily: F.disp, fontWeight: 600, fontSize: 17, letterSpacing: "0.01em", textTransform: "uppercase", color: C.ink, marginBottom: 6 }}>{d.label}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{d.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section ref={sectionRefs.pricing} className="lp-sec" style={{ background: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <Reveal style={{ textAlign: "center", maxWidth: 700, margin: "0 auto 56px" }}>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>Pricing</span>
            <h2 className="lp-h2">Start free. Scale when you ship.</h2>
            <p className="lp-sub" style={{ color: C.muted }}>Create a workspace free in minutes — no credit card. Upgrade to Pro or Business anytime from Billing.</p>
          </Reveal>
          <div className="lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, alignItems: "stretch" }}>
            {PLANS.map((p, i) => {
              const featured = !!p.highlight;
              return (
                <Reveal key={p.key} delay={i * 90}>
                  <div className="lp-card" style={{ padding: 32, position: "relative", height: "100%", display: "flex", flexDirection: "column", borderColor: featured ? "rgba(230,181,60,0.5)" : C.line, borderWidth: featured ? 1.5 : 1, background: featured ? `linear-gradient(180deg, ${C.cardHi}, ${C.surface})` : `linear-gradient(180deg, ${C.card}, ${C.surface})`, boxShadow: featured ? "0 0 0 1px rgba(230,181,60,0.18), 0 30px 60px -34px rgba(0,0,0,0.9), 0 0 60px -24px rgba(230,181,60,0.4)" : "none" }}>
                    {featured && <span style={{ position: "absolute", top: -12, left: 32, fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1A1306", background: `linear-gradient(180deg, ${C.goldB}, ${C.gold})`, padding: "5px 11px", borderRadius: 6, boxShadow: "0 6px 18px -6px rgba(230,181,60,0.7)" }}>Most popular</span>}
                    <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.goldB }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "14px 0 4px" }}>
                      <span style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 52, color: C.ink, letterSpacing: "0.01em", lineHeight: 1 }}>{p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly}`}</span>
                      {p.priceMonthly > 0 && <span style={{ fontSize: 14, color: C.muted }}>/user · mo</span>}
                    </div>
                    <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55, margin: "0 0 6px", minHeight: 40 }}>{p.blurb}</p>
                    <div className="lp-goldbar" style={{ margin: "0 0 18px" }} />
                    <div style={{ marginBottom: 24, flex: 1 }}>
                      {p.features.map((feat) => (
                        <div key={feat} className="lp-cap"><span style={{ fontSize: 13.5, color: C.body, lineHeight: 1.5 }}>{feat}</span></div>
                      ))}
                    </div>
                    <button className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-ghost"}`} style={{ width: "100%", padding: 14 }} onClick={() => openAuth("signup")}>Start free</button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ DEMO CTA ══ */}
      <section ref={sectionRefs.demo} className="lp-sec">
        <div className="lp-wrap lp-demo" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 56, alignItems: "center" }}>
          <Reveal>
            <span className="lp-eyebrow" style={{ marginBottom: 18 }}>See it with your data</span>
            <h2 className="lp-h2">Put your worst project in it.</h2>
            <p className="lp-sub" style={{ color: C.body, margin: "18px 0 26px" }}>
              Bring the job with the 14-tab RFI log and the missing mill certs. We'll show you what it looks like when every piece, document, and inspection lives in one system.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {["A walkthrough with a steel PM, not a sales rep", "Set up on one of your real projects", "No credit card, no long-term commitment"].map((t) => (
                <div key={t} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="lp-goldbar" style={{ width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, color: C.body }}>{t}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={100}>
            {demoSent ? (
              <div className="lp-card" style={{ padding: 44, textAlign: "center", borderColor: "rgba(230,181,60,0.4)" }}>
                <div style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 30, color: C.ink, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.01em" }}>Request received.</div>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, margin: 0 }}>We'll reach out within one business day to schedule your walkthrough.</p>
              </div>
            ) : (
              <form className="lp-card" onSubmit={handleDemoSubmit} style={{ padding: 32 }}>
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
                <button className="lp-btn lp-btn-primary" type="submit" style={{ width: "100%", padding: 15 }}>Request my walkthrough</button>
              </form>
            )}
          </Reveal>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section style={{ position: "relative", overflow: "hidden", padding: "108px 0", borderTop: `1px solid ${C.line}`, background: `linear-gradient(180deg, ${C.base}, ${C.surface})` }}>
        <div className="lp-glow lp-glow-anim" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 760, height: 360, background: "radial-gradient(circle, rgba(200,155,32,0.22), transparent 68%)", animation: "lpGlow 8s ease-in-out infinite" }} />
        <div className="lp-blueprint" style={{ maskImage: "radial-gradient(100% 100% at 50% 50%, #000 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(100% 100% at 50% 50%, #000 30%, transparent 75%)" }} />
        <div className="lp-wrap" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 820 }}>
          <Reveal>
            <h2 style={{ fontFamily: F.disp, fontWeight: 800, fontSize: "clamp(40px, 7vw, 80px)", lineHeight: 0.98, letterSpacing: "0.005em", textTransform: "uppercase", color: C.ink, margin: 0 }}>
              Stop managing steel <br />
              <span style={{ background: `linear-gradient(180deg, ${C.goldB}, ${C.gold})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>in spreadsheets.</span>
            </h2>
            <p style={{ fontSize: 18, color: C.body, lineHeight: 1.6, maxWidth: 560, margin: "24px auto 36px" }}>
              Spin up a free workspace for your shop and put your next project on a system that actually speaks steel.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="lp-btn lp-btn-primary" style={{ padding: "16px 34px", fontSize: 16 }} onClick={() => openAuth("signup")}>Start free</button>
              <button className="lp-btn lp-btn-ghost" style={{ padding: "16px 30px", fontSize: 16 }} onClick={() => scrollTo("demo")}>Request a demo</button>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginTop: 26 }}>
              No credit card · Set up in minutes
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: "#070A0D", padding: "60px 0 36px", borderTop: `1px solid ${C.line}` }}>
        <div className="lp-wrap lp-footer" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 32 }}>
          <div style={{ maxWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(150deg, ${C.cardHi}, ${C.surface})`, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center", color: C.goldB, fontFamily: F.disp, fontWeight: 700, fontSize: 15 }}>SB</div>
              <span style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 18, letterSpacing: "0.12em", color: C.ink }}>STEELBUILD PRO</span>
            </div>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>The project delivery platform built for structural steel fabricators and erectors.</p>
          </div>
          <div style={{ display: "flex", gap: 64, flexWrap: "wrap" }}>
            {[
              { head: "Platform", links: [["Modules", "features"], ["Workflow", "workflow"], ["Pricing", "pricing"]] },
              { head: "Company", links: [["About", "why"], ["Contact", "demo"], ["Request a demo", "demo"]] },
            ].map((col) => (
              <div key={col.head}>
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: C.goldB, marginBottom: 14 }}>{col.head}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(([label, target]) => (
                    <button key={label} className="lp-footlink" onClick={() => scrollTo(target)}>{label}</button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: C.goldB, marginBottom: 14 }}>Legal</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["Privacy", "Terms", "Security"].map((l) => (
                  <span key={l} style={{ fontSize: 13.5, color: C.muted }}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="lp-wrap" style={{ marginTop: 44, paddingTop: 22, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>© {new Date().getFullYear()} SteelBuild Pro</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>Built by steel people, for steel people.</span>
        </div>
      </footer>

      {/* ══ SIGN IN MODAL ══ */}
      {showLogin && (
        <div className="lp-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Sign in" style={{ width: "100%", maxWidth: 432, padding: 32, background: `linear-gradient(180deg, ${C.cardHi}, ${C.surface})`, border: `1px solid ${C.line2}`, borderRadius: 16, boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(230,181,60,0.1)", position: "relative" }}>
            <button onClick={() => setShowLogin(false)} aria-label="Close sign in" style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
            <img
              src={LOGO_IMG}
              alt="SteelBuild Pro"
              width={180}
              style={{ display: "block", width: 180, height: "auto", borderRadius: 12, margin: "0 auto 22px", boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(230,181,60,0.18)" }}
            />
            {signupNotice ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <h2 style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 30, letterSpacing: "0.01em", textTransform: "uppercase", color: C.ink, margin: "0 0 8px" }}>Check your email</h2>
                  <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.5 }}>{signupNotice}</p>
                </div>
                <button type="button" onClick={() => { setSignupNotice(null); setAuthMode("signin"); setPassword(""); }} className="lp-btn lp-btn-primary" style={{ width: "100%", padding: 13 }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontFamily: F.disp, fontWeight: 700, fontSize: 32, letterSpacing: "0.01em", textTransform: "uppercase", color: C.ink, margin: "0 0 6px" }}>{authMode === "signup" ? "Create your account" : "Sign in"}</h2>
                  <p style={{ fontSize: 13.5, color: C.muted, margin: 0 }}>{authMode === "signup" ? "Start a free workspace for your shop." : "Access your projects and data."}</p>
                </div>
                <form onSubmit={authMode === "signup" ? handleSignUp : handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {authMode === "signup" && (
                    <div>
                      <label style={monoLabel({ display: "block", marginBottom: 6 })}>Full name</label>
                      <input className="lp-input" type="text" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label style={monoLabel({ display: "block", marginBottom: 6 })}>Email</label>
                    <input className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={monoLabel({ display: "block", marginBottom: 6 })}>Password</label>
                    <input className="lp-input" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "At least 8 characters" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {(authMode === "signup" ? signupError : loginError) && (
                    <div style={{ padding: "10px 14px", background: "rgba(255,106,43,0.10)", border: `1px solid rgba(255,106,43,0.45)`, borderRadius: 9, fontSize: 13, color: "#FFB088" }}>{authMode === "signup" ? signupError : loginError}</div>
                  )}
                  <button type="submit" disabled={authMode === "signup" ? signupBusy : isSubmitting} className="lp-btn lp-btn-primary" style={{ width: "100%", padding: 14, cursor: (authMode === "signup" ? signupBusy : isSubmitting) ? "not-allowed" : "pointer", opacity: (authMode === "signup" ? signupBusy : isSubmitting) ? 0.6 : 1 }}>
                    {authMode === "signup" ? (signupBusy ? "Creating account…" : "Create account") : (isSubmitting ? "Signing in…" : "Sign in")}
                  </button>
                </form>
                <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: C.muted }}>
                  {authMode === "signup" ? (
                    <>Already have an account?{" "}
                      <button type="button" onClick={() => { setAuthMode("signin"); setSignupError(null); }} style={{ background: "none", border: "none", padding: 0, color: C.goldB, fontWeight: 600, cursor: "pointer", font: "inherit" }}>Sign in</button>
                    </>
                  ) : (
                    <>New to SteelBuild Pro?{" "}
                      <button type="button" onClick={() => { setAuthMode("signup"); setSignupError(null); }} style={{ background: "none", border: "none", padding: 0, color: C.goldB, fontWeight: 600, cursor: "pointer", font: "inherit" }}>Create an account</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
