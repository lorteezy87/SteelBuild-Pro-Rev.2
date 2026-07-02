/**
 * Landing — public marketing page for steelbuild-pro.com.
 *
 * Executive Light redesign: a clean, professional SaaS landing page that uses
 * the light SteelBuild Pro module mockups as visual direction — crisp white
 * cards, restrained navy typography, amber command accents, product-first
 * screenshots, and a boardroom-ready narrative for steel contractors.
 */

import React, { useState, useRef, useEffect } from "react";
import { PLANS } from "@/lib/billing/plans";
import { supabase } from "@/lib/supabase";

const C = {
  base: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  ink: "#101827",
  navy: "#172033",
  body: "#536179",
  muted: "#8491A6",
  line: "#E2E8F0",
  line2: "#CBD5E1",
  amber: "#F5A800",
  amberDark: "#C47D00",
  blue: "#2563EB",
  green: "#059669",
  red: "#DC2626",
};

const F = {
  body: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  display: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
};

const HERO_STRIP = "/steelbuild-hero.svg";
const LOGO_IMG = "/steelbuild-pro-logo.jpg";

const NAV_LINKS = [
  { label: "Platform", target: "platform" },
  { label: "Modules", target: "modules" },
  { label: "Workflow", target: "workflow" },
  { label: "Pricing", target: "pricing" },
  { label: "Demo", target: "demo" },
];

const EXEC_METRICS = [
  { value: "31", label: "Connected modules" },
  { value: "1", label: "Source of truth" },
  { value: "24/7", label: "Project visibility" },
  { value: "0", label: "Spreadsheet handoffs" },
];

const VALUE_CARDS = [
  {
    kicker: "Executive control",
    title: "Portfolio health without waiting for status meetings.",
    body: "See open RFIs, schedule exposure, cost pressure, field blockers, and production status in one command view.",
  },
  {
    kicker: "Steel-first execution",
    title: "Built around the way steel moves.",
    body: "Detailing, release, fabrication, deliveries, erection, change orders, pay apps, and closeout stay connected by project.",
  },
  {
    kicker: "Commercial confidence",
    title: "Evidence stays attached to the work.",
    body: "RFIs, photos, documents, budget hours, backcharges, and change orders stay organized for faster decisions and stronger backup.",
  },
];

const MODULES = [
  { name: "Command Center", desc: "Executive workload, risk, and decision queue", stat: "86% clear", tone: "blue" },
  { name: "Portfolio", desc: "Multi-project performance and exposure", stat: "$58.4M", tone: "green" },
  { name: "RFIs", desc: "Ownership, aging, and response control", stat: "47 open", tone: "red" },
  { name: "Detailing", desc: "Drawings, models, approvals, and release", stat: "156 dwgs", tone: "blue" },
  { name: "Schedule", desc: "Critical path, delivery, and field impacts", stat: "72%", tone: "amber" },
  { name: "Fab Release", desc: "Shop release readiness and blockers", stat: "142", tone: "green" },
  { name: "Field Today", desc: "Crew, issues, inspections, and photos", stat: "32 issues", tone: "amber" },
  { name: "Budget Control", desc: "Cost, hours, COs, and pay applications", stat: "-2.4%", tone: "green" },
];

const WORKFLOW = [
  { step: "01", title: "Plan", body: "Set up the project, team, schedule, budgets, and drawing controls." },
  { step: "02", title: "Coordinate", body: "Move RFIs, detailing, procurement, and work packages through ownership lanes." },
  { step: "03", title: "Execute", body: "Track fabrication, deliveries, field work, resources, issues, and photos." },
  { step: "04", title: "Control", body: "Protect margin with budget hours, change orders, SOVs, pay apps, and reports." },
];

const PROOF_POINTS = [
  "Project dashboard modeled after real steel PM workflows",
  "Light, executive interface aligned with the attached module mockups",
  "Module-by-module visibility without burying users in navigation",
  "Designed to feel credible in owner, GC, and leadership conversations",
];

const monoLabel = (extra = {}) => ({
  fontFamily: F.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.muted,
  ...extra,
});

function Reveal({ children, delay = 0, as: Tag = "div", className = "", style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
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

function BrandMark({ size = 38 }) {
  return (
    <div
      className="lp-brand-mark"
      style={{ width: size, height: size, minWidth: size, borderRadius: Math.max(10, size * 0.26) }}
    >
      SB
    </div>
  );
}

function ProductMockup() {
  const rows = [
    ["RFI-129", "Beam connection clarification", "In Progress", "Level 2 / Grid B-12", "May 21"],
    ["SUB-103", "Mechanical sleeve locations", "Waiting", "Mechanical", "May 20"],
    ["CO-008", "Add steel for rooftop screen", "Under Review", "Structural", "May 19"],
  ];

  return (
    <div className="lp-product-shell" aria-label="SteelBuild Pro product preview">
      <div className="lp-product-sidebar">
        <div className="lp-product-brand"><BrandMark size={28} /><span>SteelBuild Pro</span></div>
        {["Dashboard", "Command Center", "Portfolio", "Projects", "Action Items", "RFIs", "Detailing", "Schedule", "Field Today", "Budget Control"].map((item, idx) => (
          <div key={item} className={`lp-product-nav ${idx === 0 ? "active" : ""}`}>
            <span />{item}
          </div>
        ))}
      </div>
      <div className="lp-product-main">
        <div className="lp-product-topbar">
          <div className="lp-project-pill">Skyport at Redfield <span>Project ID: SB-2021</span></div>
          <div className="lp-product-search">Search drawings, submittals, RFIs, or documents...</div>
          <div className="lp-product-user">JM</div>
        </div>
        <div className="lp-product-hero">
          <div>
            <div className="lp-product-title">Dashboard</div>
            <div className="lp-product-subtitle">Project overview and quick access to SteelBuild Pro modules.</div>
            <div className="lp-product-tags"><span>13 Buildings</span><span>156 Drawings</span><span>123 RFIs Open</span></div>
          </div>
          <div className="lp-health-block"><strong>78</strong><span>Project Health</span></div>
          <div className="lp-health-block"><strong>42%</strong><span>Complete</span></div>
        </div>
        <div className="lp-product-kpis">
          {[
            ["Project Health", "78", "Good", "amber"],
            ["Open RFIs", "47", "8 need action", "red"],
            ["Schedule Health", "72%", "On Track", "green"],
            ["Cost Health", "-2.4%", "Under Budget", "green"],
          ].map(([label, value, sub, tone]) => (
            <div key={label} className="lp-product-kpi">
              <span className={`lp-kpi-icon ${tone}`} />
              <div><p>{label}</p><strong>{value}</strong><small>{sub}</small></div>
            </div>
          ))}
        </div>
        <div className="lp-product-grid">
          <div className="lp-product-card modules">
            <div className="lp-product-card-head"><strong>SteelBuild Modules</strong><span>View all</span></div>
            <div className="lp-mini-modules">
              {["RFIs", "Detailing", "Schedule", "Field Hub", "Budget", "Change Orders"].map((name, idx) => (
                <div key={name} className="lp-mini-module" style={{ backgroundImage: `linear-gradient(180deg, rgba(16,24,39,.12), rgba(16,24,39,.78)), url(${HERO_STRIP})` }}>
                  <strong>{name}</strong>
                  <span>{idx % 2 ? "Active" : "Open"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-product-card alerts">
            <div className="lp-product-card-head"><strong>Critical Alerts</strong><span>View all</span></div>
            {[
              ["Overdue Drawings", "6 items past due", "High"],
              ["RFIs Overdue", "3 waiting on response", "High"],
              ["Activities At Risk", "14 schedule items", "Medium"],
              ["Field Issues", "5 require attention", "Low"],
            ].map(([title, sub, sev]) => (
              <div key={title} className="lp-alert-row"><div><strong>{title}</strong><span>{sub}</span></div><em>{sev}</em></div>
            ))}
          </div>
        </div>
        <div className="lp-product-table">
          <div className="lp-table-filter">Search dashboard...</div>
          <table>
            <thead><tr><th>ID</th><th>Description</th><th>Status</th><th>Related To</th><th>Updated</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={c} className={i === 2 ? "status" : ""}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onLogin, onSignUp, isSubmitting, loginError }) {
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
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
  const [demoError, setDemoError] = useState(null);
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const sectionRefs = {
    platform: useRef(null),
    modules: useRef(null),
    workflow: useRef(null),
    pricing: useRef(null),
    demo: useRef(null),
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  useEffect(() => {
    if (!showLogin) return undefined;
    const handler = (e) => { if (e.key === "Escape") setShowLogin(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showLogin]);

  useEffect(() => {
    if (showLogin) {
      setSignupNotice(null);
      setSignupError(null);
    }
  }, [showLogin]);

  const scrollTo = (key) => {
    sectionRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNav(false);
  };

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
    if (password.length < 8) {
      setSignupError("Use at least 8 characters for your password.");
      return;
    }
    setSignupBusy(true);
    const res = await onSignUp?.({ email: email.trim(), password, fullName: fullName.trim() || undefined });
    setSignupBusy(false);
    if (res?.success) {
      if (res.needsConfirmation) {
        setSignupNotice(`We sent a confirmation link to ${email.trim()}. Click it to activate your account, then sign in.`);
      }
    } else if (res?.error) {
      setSignupError(res.error.message);
    }
  };

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    if (demoSubmitting) return;
    setDemoError(null);
    setDemoSubmitting(true);
    try {
      const { error } = await supabase.from("demo_requests").insert({
        name: demoForm.name.trim(),
        email: demoForm.email.trim(),
        company: demoForm.company.trim() || null,
        tonnage: demoForm.tonnage.trim() || null,
        message: demoForm.message.trim() || null,
      });
      if (error) throw error;
      setDemoSent(true);
    } catch {
      setDemoError("Something went wrong sending your request. Please email support@steelbuild-pro.com or try again.");
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="lp-page">
      <style>{`
        @keyframes lpFloat { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-10px,0); } }
        @keyframes lpShine { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes lpFadeIn { from { opacity: 0; } to { opacity: 1; } }

        .lp-page { min-height: 100vh; background: ${C.base}; color: ${C.body}; font-family: ${F.body}; overflow-x: hidden; position: relative; }
        .lp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 32px; position: relative; }
        .lp-sec { padding: 104px 0; position: relative; }
        .lp-reveal { opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); }
        .lp-reveal.is-in { opacity: 1; transform: translateY(0); }
        .lp-brand-mark { display: grid; place-items: center; background: linear-gradient(180deg, #FFF7DE, #FFFFFF); border: 2px solid ${C.amber}; color: ${C.amberDark}; font-weight: 900; font-size: 12px; letter-spacing: .02em; box-shadow: 0 12px 24px rgba(245,168,0,.15); }
        .lp-kicker { display: inline-flex; align-items: center; gap: 10px; font-family: ${F.mono}; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: ${C.amberDark}; }
        .lp-kicker::before { content: ''; width: 28px; height: 2px; border-radius: 999px; background: linear-gradient(90deg, transparent, ${C.amber}); }
        .lp-h1 { font-family: ${F.display}; font-size: clamp(46px, 6.4vw, 84px); line-height: .96; letter-spacing: -.06em; color: ${C.ink}; margin: 20px 0 0; font-weight: 900; }
        .lp-h2 { font-family: ${F.display}; font-size: clamp(34px, 4.6vw, 60px); line-height: 1; letter-spacing: -.05em; color: ${C.ink}; margin: 16px 0 0; font-weight: 900; }
        .lp-sub { font-size: 18px; line-height: 1.68; color: ${C.body}; margin: 18px 0 0; }
        .lp-btn { appearance: none; border: 1px solid transparent; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 12px 22px; font-size: 14px; font-weight: 800; letter-spacing: -.01em; cursor: pointer; transition: transform .16s, box-shadow .16s, border-color .16s, background .16s, opacity .16s; }
        .lp-btn:hover { transform: translateY(-2px); }
        .lp-btn-primary { color: #1F1600; background: linear-gradient(180deg, #FFC94D, ${C.amber}); box-shadow: 0 12px 28px rgba(245,168,0,.28), inset 0 1px 0 rgba(255,255,255,.55); border-color: #E7A116; }
        .lp-btn-secondary { color: ${C.navy}; background: #FFFFFF; border-color: ${C.line2}; box-shadow: 0 10px 24px rgba(15,23,42,.08); }
        .lp-btn-secondary:hover { border-color: ${C.amber}; box-shadow: 0 14px 28px rgba(15,23,42,.11); }
        .lp-card { background: rgba(255,255,255,.86); border: 1px solid ${C.line}; border-radius: 24px; box-shadow: 0 18px 54px rgba(15,23,42,.08); }
        .lp-navlink { border: none; background: none; padding: 8px 2px; color: ${C.body}; font: inherit; font-size: 14px; font-weight: 750; cursor: pointer; }
        .lp-navlink:hover { color: ${C.ink}; }
        .lp-mobile-toggle { display: none; border: 1px solid ${C.line}; background: #FFFFFF; border-radius: 12px; color: ${C.ink}; font-size: 20px; padding: 6px 10px; cursor: pointer; }
        .lp-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border: 1px solid ${C.line2}; border-radius: 12px; background: #FFFFFF; color: ${C.ink}; font-family: ${F.body}; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
        .lp-input:focus { border-color: ${C.amber}; box-shadow: 0 0 0 4px rgba(245,168,0,.16); }
        .lp-input::placeholder { color: ${C.muted}; }
        .lp-grid-bg { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(23,32,51,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(23,32,51,.05) 1px, transparent 1px); background-size: 46px 46px; mask-image: radial-gradient(80% 60% at 50% 0%, #000, transparent 76%); -webkit-mask-image: radial-gradient(80% 60% at 50% 0%, #000, transparent 76%); }

        .lp-product-shell { width: min(760px, 100%); display: grid; grid-template-columns: 150px minmax(0,1fr); background: #F8FAFC; border: 1px solid ${C.line}; border-radius: 28px; overflow: hidden; box-shadow: 0 30px 80px rgba(15,23,42,.18); animation: lpFloat 9s ease-in-out infinite; position: relative; }
        .lp-product-shell::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.18) 46%, transparent 62%); transform: translateX(-120%); animation: lpShine 8s ease-in-out infinite; }
        .lp-product-sidebar { background: #FFFFFF; border-right: 1px solid ${C.line}; padding: 16px 12px; }
        .lp-product-brand { display: flex; align-items: center; gap: 8px; color: ${C.ink}; font-weight: 900; font-size: 13px; margin-bottom: 16px; }
        .lp-product-nav { display: flex; align-items: center; gap: 8px; min-height: 26px; padding: 0 8px; border-radius: 8px; color: ${C.body}; font-size: 10px; font-weight: 800; margin-bottom: 3px; }
        .lp-product-nav span { width: 8px; height: 8px; border-radius: 3px; border: 1px solid ${C.line2}; }
        .lp-product-nav.active { background: #FFF4D5; color: ${C.ink}; }
        .lp-product-nav.active span { border-color: ${C.amber}; background: ${C.amber}; }
        .lp-product-main { min-width: 0; padding: 14px; }
        .lp-product-topbar { display: grid; grid-template-columns: 190px 1fr 34px; gap: 10px; align-items: center; margin-bottom: 12px; }
        .lp-project-pill, .lp-product-search, .lp-product-user { background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 12px; color: ${C.body}; box-shadow: 0 6px 14px rgba(15,23,42,.04); }
        .lp-project-pill { padding: 9px 12px; color: ${C.ink}; font-weight: 900; font-size: 12px; }
        .lp-project-pill span { display: block; color: ${C.muted}; font-weight: 650; font-size: 10px; margin-top: 2px; }
        .lp-product-search { height: 38px; display: flex; align-items: center; padding: 0 12px; font-size: 11px; }
        .lp-product-user { height: 34px; width: 34px; display: grid; place-items: center; color: #FFFFFF; background: ${C.navy}; border-radius: 999px; font-weight: 900; font-size: 11px; }
        .lp-product-hero { display: grid; grid-template-columns: 1fr 72px 72px; gap: 10px; align-items: center; min-height: 104px; border: 1px solid ${C.line}; border-radius: 18px; padding: 18px; background-image: linear-gradient(90deg, rgba(255,255,255,.98) 0%, rgba(255,255,255,.88) 48%, rgba(255,255,255,.66) 100%), url(${HERO_STRIP}); background-size: cover; background-position: center; }
        .lp-product-title { color: ${C.ink}; font-size: 25px; font-weight: 950; letter-spacing: -.05em; }
        .lp-product-subtitle { color: ${C.body}; font-size: 12px; margin-top: 2px; }
        .lp-product-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .lp-product-tags span { border: 1px solid ${C.line}; background: #FFFFFF; border-radius: 8px; padding: 5px 8px; font-size: 10px; font-weight: 900; color: ${C.body}; }
        .lp-health-block { background: rgba(255,255,255,.9); border: 1px solid ${C.line}; border-radius: 14px; padding: 10px; text-align: center; }
        .lp-health-block strong { display: block; color: ${C.ink}; font-size: 20px; line-height: 1; }
        .lp-health-block span { display: block; color: ${C.body}; font-size: 9px; margin-top: 5px; }
        .lp-product-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
        .lp-product-kpi { background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 14px; padding: 12px; display: flex; gap: 10px; align-items: center; }
        .lp-kpi-icon { width: 24px; height: 24px; border-radius: 999px; background: #FFF4D5; box-shadow: inset 0 0 0 1px rgba(245,168,0,.26); flex: 0 0 24px; }
        .lp-kpi-icon.green { background: #DCFCE7; box-shadow: inset 0 0 0 1px rgba(5,150,105,.24); }
        .lp-kpi-icon.red { background: #FEE2E2; box-shadow: inset 0 0 0 1px rgba(220,38,38,.22); }
        .lp-kpi-icon.blue { background: #DBEAFE; box-shadow: inset 0 0 0 1px rgba(37,99,235,.22); }
        .lp-product-kpi p { margin: 0 0 2px; color: ${C.body}; font-size: 10px; font-weight: 850; }
        .lp-product-kpi strong { display: block; color: ${C.ink}; font-size: 20px; line-height: 1; }
        .lp-product-kpi small { display: block; color: ${C.muted}; font-size: 9px; margin-top: 3px; }
        .lp-product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .lp-product-card { background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 16px; padding: 12px; min-width: 0; }
        .lp-product-card-head { display: flex; justify-content: space-between; color: ${C.ink}; font-size: 12px; margin-bottom: 10px; }
        .lp-product-card-head span { color: ${C.blue}; font-size: 10px; font-weight: 900; }
        .lp-mini-modules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .lp-mini-module { min-height: 70px; border-radius: 12px; padding: 9px; background-size: cover; background-position: center; color: #FFFFFF; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
        .lp-mini-module strong { font-size: 11px; line-height: 1; }
        .lp-mini-module span { color: #FFC94D; font-size: 9px; font-weight: 900; margin-top: 4px; }
        .lp-alert-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; border-top: 1px solid ${C.line}; padding: 8px 0; }
        .lp-alert-row:first-of-type { border-top: 0; padding-top: 0; }
        .lp-alert-row strong { display: block; color: ${C.ink}; font-size: 11px; }
        .lp-alert-row span { display: block; color: ${C.muted}; font-size: 9px; margin-top: 2px; }
        .lp-alert-row em { font-style: normal; color: ${C.red}; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 4px 6px; font-size: 9px; font-weight: 900; }
        .lp-product-table { background: #FFFFFF; border: 1px solid ${C.line}; border-radius: 16px; margin-top: 10px; overflow: hidden; }
        .lp-table-filter { height: 34px; display: flex; align-items: center; border-bottom: 1px solid ${C.line}; color: ${C.muted}; font-size: 11px; padding: 0 12px; }
        .lp-product-table table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .lp-product-table th { text-align: left; color: ${C.muted}; padding: 8px 12px; background: #F8FAFC; font-weight: 900; }
        .lp-product-table td { color: ${C.body}; padding: 9px 12px; border-top: 1px solid ${C.line}; white-space: nowrap; }
        .lp-product-table td:first-child { color: ${C.blue}; font-weight: 900; }
        .lp-product-table td.status { color: ${C.amberDark}; font-weight: 900; }
        .lp-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15,23,42,.56); backdrop-filter: blur(10px); animation: lpFadeIn .18s ease; }
        .lp-footlink { background: none; border: none; padding: 0; text-align: left; color: ${C.body}; font: inherit; font-size: 13.5px; cursor: pointer; text-decoration: none; }
        .lp-footlink:hover { color: ${C.ink}; }

        @media (prefers-reduced-motion: reduce) {
          .lp-reveal, .lp-product-shell { opacity: 1 !important; transform: none !important; transition: none !important; animation: none !important; }
          .lp-product-shell::after { animation: none !important; display: none !important; }
          .lp-btn:hover { transform: none !important; }
        }
        @media (max-width: 1060px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-product-shell { margin: 0 auto; }
          .lp-c3 { grid-template-columns: 1fr 1fr !important; }
          .lp-demo-grid, .lp-proof-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 760px) {
          .lp-wrap { padding: 0 20px; }
          .lp-sec { padding: 78px 0; }
          .lp-nav-links { display: none !important; }
          .lp-mobile-toggle { display: inline-flex !important; }
          .lp-stat-grid, .lp-c2, .lp-c3, .lp-c4, .lp-module-grid, .lp-plan-grid { grid-template-columns: 1fr !important; }
          .lp-product-shell { grid-template-columns: 1fr; border-radius: 22px; }
          .lp-product-sidebar { display: none; }
          .lp-product-topbar { grid-template-columns: 1fr 34px; }
          .lp-product-search { display: none; }
          .lp-product-hero { grid-template-columns: 1fr; }
          .lp-product-kpis { grid-template-columns: 1fr 1fr; }
          .lp-product-grid { grid-template-columns: 1fr; }
          .lp-product-table { display: none; }
          .lp-footer-main { flex-direction: column !important; }
        }
        @media (max-width: 520px) {
          .lp-product-kpis, .lp-mini-modules { grid-template-columns: 1fr 1fr; }
          .lp-h1 { font-size: clamp(40px, 14vw, 58px); }
        }
      `}</style>

      <div style={{ height: 4, background: `linear-gradient(90deg, ${C.amber}, #FFD466, ${C.blue})` }} />
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: scrolled ? "rgba(255,255,255,.88)" : "rgba(255,255,255,.68)", backdropFilter: "blur(18px)", borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`, transition: "background .2s, border-color .2s" }}>
        <div className="lp-wrap" style={{ height: 74, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <button type="button" onClick={() => scrollTo("platform")} style={{ display: "flex", alignItems: "center", gap: 12, border: 0, background: "none", padding: 0, cursor: "pointer" }}>
            <BrandMark />
            <span style={{ color: C.ink, fontWeight: 950, letterSpacing: "-.04em", fontSize: 20 }}>SteelBuild Pro</span>
          </button>
          <div className="lp-nav-links" style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {NAV_LINKS.map(({ label, target }) => <button key={target} className="lp-navlink" onClick={() => scrollTo(target)}>{label}</button>)}
            <button className="lp-navlink" style={{ color: C.ink }} onClick={() => openAuth("signin")}>Sign in</button>
            <button className="lp-btn lp-btn-primary" onClick={() => openAuth("signup")}>Start free</button>
          </div>
          <button className="lp-mobile-toggle" aria-label={mobileNav ? "Close menu" : "Open menu"} onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? "✕" : "☰"}</button>
        </div>
        {mobileNav && (
          <div className="lp-wrap" style={{ paddingTop: 14, paddingBottom: 20, display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.line}`, background: "rgba(255,255,255,.96)" }}>
            {NAV_LINKS.map(({ label, target }) => <button key={target} className="lp-navlink" style={{ textAlign: "left", fontSize: 16 }} onClick={() => scrollTo(target)}>{label}</button>)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
              <button className="lp-btn lp-btn-secondary" onClick={() => openAuth("signin")}>Sign in</button>
              <button className="lp-btn lp-btn-primary" onClick={() => openAuth("signup")}>Start free</button>
            </div>
          </div>
        )}
      </nav>

      <section ref={sectionRefs.platform} style={{ padding: "84px 0 88px", position: "relative", overflow: "hidden" }}>
        <div className="lp-grid-bg" />
        <div style={{ position: "absolute", width: 680, height: 680, borderRadius: "50%", right: "-22%", top: "-22%", background: "radial-gradient(circle, rgba(245,168,0,.20), transparent 68%)", pointerEvents: "none" }} />
        <div className="lp-wrap lp-hero-grid" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 56, alignItems: "center" }}>
          <Reveal>
            <span className="lp-kicker">Executive project control for steel</span>
            <h1 className="lp-h1">A sharper operating system for structural steel teams.</h1>
            <p className="lp-sub" style={{ maxWidth: 570, fontSize: 20 }}>
              SteelBuild Pro gives owners, PMs, detailers, shop leaders, and field teams one polished command layer for project health, RFIs, detailing, schedule, field work, cost, documents, and closeout.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 34 }}>
              <button className="lp-btn lp-btn-primary" style={{ minHeight: 50, padding: "14px 28px" }} onClick={() => openAuth("signup")}>Start free</button>
              <button className="lp-btn lp-btn-secondary" style={{ minHeight: 50, padding: "14px 26px" }} onClick={() => scrollTo("demo")}>Request executive demo</button>
            </div>
            <div className="lp-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginTop: 38 }}>
              {EXEC_METRICS.map((s) => (
                <div key={s.label} className="lp-card" style={{ padding: "18px 16px", borderRadius: 18, boxShadow: "0 12px 30px rgba(15,23,42,.06)" }}>
                  <div style={{ color: C.ink, fontWeight: 950, fontSize: 24, letterSpacing: "-.04em" }}>{s.value}</div>
                  <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.35, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ProductMockup />
          </Reveal>
        </div>
      </section>

      <section className="lp-sec" style={{ paddingTop: 22 }}>
        <div className="lp-wrap lp-c3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {VALUE_CARDS.map((card, i) => (
            <Reveal key={card.kicker} delay={i * 80}>
              <div className="lp-card" style={{ height: "100%", padding: 28, borderRadius: 24 }}>
                <div style={monoLabel({ color: C.amberDark })}>{card.kicker}</div>
                <h3 style={{ color: C.ink, fontSize: 25, lineHeight: 1.08, letterSpacing: "-.04em", margin: "14px 0 10px", fontWeight: 900 }}>{card.title}</h3>
                <p style={{ color: C.body, fontSize: 15, lineHeight: 1.62, margin: 0 }}>{card.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section ref={sectionRefs.modules} className="lp-sec" style={{ background: "#FFFFFF", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <Reveal style={{ maxWidth: 760, marginBottom: 42 }}>
            <span className="lp-kicker">Module suite</span>
            <h2 className="lp-h2">A complete steel command center, not another generic task app.</h2>
            <p className="lp-sub">The attached reference mockups show the direction: clean light modules, clear KPIs, fast filters, and decision-ready cards on every page.</p>
          </Reveal>
          <div className="lp-module-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {MODULES.map((m, i) => (
              <Reveal key={m.name} delay={(i % 4) * 65}>
                <div className="lp-card" style={{ padding: 20, borderRadius: 20, height: "100%", boxShadow: "0 12px 32px rgba(15,23,42,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 12, background: m.tone === "green" ? "#DCFCE7" : m.tone === "red" ? "#FEE2E2" : m.tone === "blue" ? "#DBEAFE" : "#FFF4D5", border: `1px solid ${C.line}` }} />
                    <span style={{ color: m.tone === "green" ? C.green : m.tone === "red" ? C.red : m.tone === "blue" ? C.blue : C.amberDark, fontWeight: 950, fontSize: 13 }}>{m.stat}</span>
                  </div>
                  <h3 style={{ color: C.ink, fontSize: 18, letterSpacing: "-.03em", margin: "18px 0 8px", fontWeight: 900 }}>{m.name}</h3>
                  <p style={{ color: C.body, fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>{m.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section ref={sectionRefs.workflow} className="lp-sec" style={{ overflow: "hidden" }}>
        <div className="lp-wrap lp-proof-grid" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 44, alignItems: "start" }}>
          <Reveal>
            <span className="lp-kicker">From project kickoff to closeout</span>
            <h2 className="lp-h2">Keep leadership, shop, and field aligned on the same facts.</h2>
            <p className="lp-sub">SteelBuild Pro presents operations with the visual clarity executives expect and the workflow detail project teams need.</p>
            <div style={{ marginTop: 30, display: "grid", gap: 12 }}>
              {PROOF_POINTS.map((point) => (
                <div key={point} style={{ display: "flex", gap: 12, alignItems: "flex-start", color: C.body, fontSize: 14.5, lineHeight: 1.45 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#FFF4D5", border: `1px solid rgba(245,168,0,.45)`, flex: "0 0 18px", marginTop: 1 }} />
                  {point}
                </div>
              ))}
            </div>
          </Reveal>
          <div style={{ display: "grid", gap: 16 }}>
            {WORKFLOW.map((item, i) => (
              <Reveal key={item.step} delay={i * 80}>
                <div className="lp-card" style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: 18, alignItems: "center", padding: 22, borderRadius: 22 }}>
                  <div style={{ fontFamily: F.mono, color: C.amberDark, background: "#FFF4D5", border: `1px solid rgba(245,168,0,.38)`, borderRadius: 16, height: 58, display: "grid", placeItems: "center", fontWeight: 950, fontSize: 16 }}>{item.step}</div>
                  <div>
                    <h3 style={{ margin: "0 0 5px", color: C.ink, fontWeight: 950, fontSize: 21, letterSpacing: "-.04em" }}>{item.title}</h3>
                    <p style={{ margin: 0, color: C.body, lineHeight: 1.55, fontSize: 14.5 }}>{item.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section ref={sectionRefs.pricing} className="lp-sec" style={{ background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="lp-wrap">
          <Reveal style={{ textAlign: "center", maxWidth: 760, margin: "0 auto 44px" }}>
            <span className="lp-kicker">Pricing</span>
            <h2 className="lp-h2">Start lean. Scale when the team is ready.</h2>
            <p className="lp-sub">Create a workspace free in minutes. Upgrade to Pro or Business from Billing when you are ready to roll it out across projects.</p>
          </Reveal>
          <div className="lp-plan-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
            {PLANS.map((p, i) => {
              const featured = !!p.highlight;
              return (
                <Reveal key={p.key} delay={i * 90}>
                  <div className="lp-card" style={{ height: "100%", padding: 30, borderRadius: 24, display: "flex", flexDirection: "column", borderColor: featured ? "rgba(245,168,0,.65)" : C.line, boxShadow: featured ? "0 24px 62px rgba(245,168,0,.16), 0 18px 54px rgba(15,23,42,.08)" : "0 18px 54px rgba(15,23,42,.07)", position: "relative" }}>
                    {featured && <span style={{ position: "absolute", top: -12, left: 28, background: C.ink, color: "#FFFFFF", borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 900 }}>Most popular</span>}
                    <div style={monoLabel({ color: C.amberDark })}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "16px 0 6px" }}>
                      <span style={{ color: C.ink, fontWeight: 950, fontSize: 48, letterSpacing: "-.06em", lineHeight: 1 }}>{p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly}`}</span>
                      {p.priceMonthly > 0 && <span style={{ color: C.muted, fontSize: 14 }}>/user · mo</span>}
                    </div>
                    <p style={{ color: C.body, fontSize: 14, lineHeight: 1.55, minHeight: 44, margin: "0 0 20px" }}>{p.blurb}</p>
                    <div style={{ display: "grid", gap: 10, marginBottom: 24, flex: 1 }}>
                      {p.features.map((feat) => (
                        <div key={feat} style={{ display: "flex", gap: 10, color: C.body, fontSize: 13.5, lineHeight: 1.45 }}>
                          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#DCFCE7", border: "1px solid #BBF7D0", flex: "0 0 16px", marginTop: 1 }} />
                          {feat}
                        </div>
                      ))}
                    </div>
                    <button className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-secondary"}`} onClick={() => openAuth("signup")}>Start free</button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section ref={sectionRefs.demo} className="lp-sec">
        <div className="lp-wrap lp-demo-grid" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 52, alignItems: "center" }}>
          <Reveal>
            <span className="lp-kicker">Executive walkthrough</span>
            <h2 className="lp-h2">See the light-command interface on a real steel workflow.</h2>
            <p className="lp-sub">Bring the project that is hardest to control. We will show how the module layout, dashboards, filters, and evidence trail keep the team aligned.</p>
            <div style={{ marginTop: 28, borderRadius: 24, padding: 24, backgroundImage: `linear-gradient(90deg, rgba(16,24,39,.84), rgba(16,24,39,.48)), url(${HERO_STRIP})`, backgroundSize: "cover", backgroundPosition: "center", color: "#FFFFFF" }}>
              <div style={monoLabel({ color: "#FFD466" })}>What you will review</div>
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {["Dashboard and command center", "Module-by-module execution flow", "Project risk and commercial controls", "User onboarding and rollout plan"].map((item) => (
                  <div key={item} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber }} />{item}</div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            {demoSent ? (
              <div className="lp-card" style={{ padding: 44, textAlign: "center" }}>
                <h3 style={{ color: C.ink, margin: "0 0 10px", fontSize: 30, letterSpacing: "-.04em" }}>Request received.</h3>
                <p style={{ color: C.body, lineHeight: 1.6, margin: 0 }}>We will reach out within one business day to schedule your walkthrough.</p>
              </div>
            ) : (
              <form className="lp-card" onSubmit={handleDemoSubmit} style={{ padding: 30, borderRadius: 24 }}>
                <div className="lp-c2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div><label style={monoLabel({ display: "block", marginBottom: 7 })}>Name</label><input className="lp-input" type="text" placeholder="Jane Smith" value={demoForm.name} onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })} required /></div>
                  <div><label style={monoLabel({ display: "block", marginBottom: 7 })}>Work email</label><input className="lp-input" type="email" placeholder="jane@steelco.com" value={demoForm.email} onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })} required /></div>
                  <div><label style={monoLabel({ display: "block", marginBottom: 7 })}>Company</label><input className="lp-input" type="text" placeholder="Redfield Steel" value={demoForm.company} onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })} required /></div>
                  <div><label style={monoLabel({ display: "block", marginBottom: 7 })}>Annual tonnage</label><input className="lp-input" type="text" placeholder="8,000" value={demoForm.tonnage} onChange={(e) => setDemoForm({ ...demoForm, tonnage: e.target.value })} /></div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={monoLabel({ display: "block", marginBottom: 7 })}>What should the walkthrough focus on?</label>
                  <textarea className="lp-input" rows={4} placeholder="RFIs, detailing, field issues, change orders, reports..." value={demoForm.message} onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })} style={{ resize: "vertical" }} />
                </div>
                {demoError && <p style={{ fontSize: 13, color: C.red, lineHeight: 1.5, margin: "0 0 12px" }}>{demoError}</p>}
                <button className="lp-btn lp-btn-primary" type="submit" disabled={demoSubmitting} style={{ width: "100%", opacity: demoSubmitting ? .65 : 1, cursor: demoSubmitting ? "wait" : "pointer" }}>{demoSubmitting ? "Sending…" : "Request my walkthrough"}</button>
              </form>
            )}
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "92px 0", background: C.ink, color: "#FFFFFF", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .18, backgroundImage: `url(${HERO_STRIP})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="lp-wrap" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 860 }}>
          <Reveal>
            <span className="lp-kicker" style={{ color: "#FFD466" }}>Boardroom polish. Jobsite utility.</span>
            <h2 style={{ color: "#FFFFFF", fontSize: "clamp(38px, 6vw, 72px)", lineHeight: .98, letterSpacing: "-.06em", margin: "18px 0 0", fontWeight: 950 }}>Give your steel operation a page that looks as serious as the work.</h2>
            <p style={{ color: "rgba(255,255,255,.74)", fontSize: 18, lineHeight: 1.65, maxWidth: 640, margin: "22px auto 34px" }}>Start with a clean workspace, then bring the team into a platform designed around steel project delivery.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
              <button className="lp-btn lp-btn-primary" onClick={() => openAuth("signup")}>Start free</button>
              <button className="lp-btn lp-btn-secondary" onClick={() => scrollTo("demo")}>Request a demo</button>
            </div>
          </Reveal>
        </div>
      </section>

      <footer style={{ background: "#FFFFFF", borderTop: `1px solid ${C.line}`, padding: "54px 0 34px" }}>
        <div className="lp-wrap lp-footer-main" style={{ display: "flex", justifyContent: "space-between", gap: 34, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 330 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}><BrandMark /><span style={{ color: C.ink, fontWeight: 950, fontSize: 20, letterSpacing: "-.04em" }}>SteelBuild Pro</span></div>
            <p style={{ color: C.body, lineHeight: 1.6, margin: 0, fontSize: 13.5 }}>A professional project delivery platform built for structural steel teams.</p>
          </div>
          <div style={{ display: "flex", gap: 58, flexWrap: "wrap" }}>
            {[
              { head: "Platform", links: [["Modules", "modules"], ["Workflow", "workflow"], ["Pricing", "pricing"]] },
              { head: "Company", links: [["Executive demo", "demo"], ["Start free", "platform"]] },
            ].map((col) => (
              <div key={col.head}>
                <div style={monoLabel({ color: C.amberDark, marginBottom: 14 })}>{col.head}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {col.links.map(([label, target]) => <button key={label} className="lp-footlink" onClick={() => scrollTo(target)}>{label}</button>)}
                </div>
              </div>
            ))}
            <div>
              <div style={monoLabel({ color: C.amberDark, marginBottom: 14 })}>Legal</div>
              <div style={{ display: "grid", gap: 10 }}>{["Privacy", "Terms", "Security", "Subprocessors"].map((l) => <a key={l} href={`/${l}`} className="lp-footlink">{l}</a>)}</div>
            </div>
          </div>
        </div>
        <div className="lp-wrap" style={{ marginTop: 42, paddingTop: 20, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>© {new Date().getFullYear()} SteelBuild Pro</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>Executive-grade project controls for structural steel.</span>
        </div>
      </footer>

      {showLogin && (
        <div className="lp-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <div role="dialog" aria-modal="true" aria-label={authMode === "signup" ? "Create account" : "Sign in"} className="lp-card" style={{ width: "100%", maxWidth: 438, padding: 32, borderRadius: 24, position: "relative", boxShadow: "0 34px 90px rgba(15,23,42,.28)" }}>
            <button onClick={() => setShowLogin(false)} aria-label="Close sign in" style={{ position: "absolute", top: 16, right: 16, border: 0, background: "#F1F5F9", color: C.body, borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontSize: 18 }}>×</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <img src={LOGO_IMG} alt="SteelBuild Pro" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 14, border: `1px solid ${C.line}` }} />
              <div><div style={{ color: C.ink, fontWeight: 950, fontSize: 20, letterSpacing: "-.04em" }}>SteelBuild Pro</div><div style={{ color: C.muted, fontSize: 13 }}>Project controls for steel</div></div>
            </div>
            {signupNotice ? (
              <div style={{ display: "grid", gap: 18 }}>
                <div><h2 style={{ color: C.ink, margin: "0 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>Check your email</h2><p style={{ color: C.body, margin: 0, lineHeight: 1.55, fontSize: 14 }}>{signupNotice}</p></div>
                <button type="button" onClick={() => { setSignupNotice(null); setAuthMode("signin"); setPassword(""); }} className="lp-btn lp-btn-primary">Back to sign in</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 22 }}>
                  <h2 style={{ color: C.ink, margin: "0 0 6px", fontSize: 32, letterSpacing: "-.05em", fontWeight: 950 }}>{authMode === "signup" ? "Create your account" : "Sign in"}</h2>
                  <p style={{ color: C.body, margin: 0, fontSize: 14 }}>{authMode === "signup" ? "Start a free workspace for your team." : "Access your projects and modules."}</p>
                </div>
                <form onSubmit={authMode === "signup" ? handleSignUp : handleLogin} style={{ display: "grid", gap: 15 }}>
                  {authMode === "signup" && <div><label style={monoLabel({ display: "block", marginBottom: 6 })}>Full name</label><input className="lp-input" type="text" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>}
                  <div><label style={monoLabel({ display: "block", marginBottom: 6 })}>Email</label><input className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><label style={monoLabel({ display: "block", marginBottom: 6 })}>Password</label><input className="lp-input" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "At least 8 characters" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  {(authMode === "signup" ? signupError : loginError) && <div style={{ padding: "10px 13px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, color: C.red, fontSize: 13 }}>{authMode === "signup" ? signupError : loginError}</div>}
                  <button type="submit" disabled={authMode === "signup" ? signupBusy : isSubmitting} className="lp-btn lp-btn-primary" style={{ width: "100%", opacity: (authMode === "signup" ? signupBusy : isSubmitting) ? .65 : 1, cursor: (authMode === "signup" ? signupBusy : isSubmitting) ? "not-allowed" : "pointer" }}>{authMode === "signup" ? (signupBusy ? "Creating account…" : "Create account") : (isSubmitting ? "Signing in…" : "Sign in")}</button>
                  {authMode === "signup" && <p style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.5, margin: 0 }}>By creating an account you agree to the <a href="/terms" style={{ color: C.amberDark, textDecoration: "none", fontWeight: 800 }}>Terms</a> and <a href="/privacy" style={{ color: C.amberDark, textDecoration: "none", fontWeight: 800 }}>Privacy Policy</a>.</p>}
                </form>
                <div style={{ marginTop: 18, textAlign: "center", fontSize: 13.5, color: C.body }}>
                  {authMode === "signup" ? <>Already have an account? <button type="button" onClick={() => { setAuthMode("signin"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 900, cursor: "pointer", font: "inherit" }}>Sign in</button></> : <>New to SteelBuild Pro? <button type="button" onClick={() => { setAuthMode("signup"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 900, cursor: "pointer", font: "inherit" }}>Create an account</button></>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
