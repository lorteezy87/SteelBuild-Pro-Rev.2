/**
 * Presentational blocks + content constants for Landing page.
 */
// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
export const C = {
  // Dual-theme hex allowlist: public landing uses a fixed executive-light brand palette.
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

export const F = {
  body: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  display: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
};

export const HERO_STRIP = "/steelbuild-hero.svg";
export const LOGO_IMG = "/steelbuild-pro-logo.jpg";

export const NAV_LINKS = [
  { label: "Platform", target: "platform" },
  { label: "Modules", target: "modules" },
  { label: "Workflow", target: "workflow" },
  { label: "Pricing", target: "pricing" },
  { label: "Demo", target: "demo" },
];

export const EXEC_METRICS = [
  { value: "8", label: "Featured modules" },
  { value: "1", label: "Source of truth" },
  { value: "24/7", label: "Project visibility" },
  { value: "0", label: "Spreadsheet handoffs" },
];

export const VALUE_CARDS = [
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

export const MODULES = [
  { name: "Command Center", desc: "Executive workload, risk, and decision queue", stat: "86% clear", tone: "blue" },
  { name: "Portfolio", desc: "Multi-project performance and exposure", stat: "$58.4M", tone: "green" },
  { name: "RFIs", desc: "Ownership, aging, and response control", stat: "47 open", tone: "red" },
  { name: "Detailing", desc: "Drawings, models, approvals, and release", stat: "156 dwgs", tone: "blue" },
  { name: "Schedule", desc: "Critical path, delivery, and field impacts", stat: "72%", tone: "amber" },
  { name: "Fab Release", desc: "Shop release readiness and blockers", stat: "142", tone: "green" },
  { name: "Field Today", desc: "Crew, issues, inspections, and photos", stat: "32 issues", tone: "amber" },
  { name: "Budget Control", desc: "Cost, hours, COs, and pay applications", stat: "-2.4%", tone: "green" },
];

export const WORKFLOW = [
  { step: "01", title: "Plan", body: "Set up the project, team, schedule, budgets, and drawing controls." },
  { step: "02", title: "Coordinate", body: "Move RFIs, detailing, procurement, and work packages through ownership lanes." },
  { step: "03", title: "Execute", body: "Track fabrication, deliveries, field work, resources, issues, and photos." },
  { step: "04", title: "Control", body: "Protect margin with budget hours, change orders, SOVs, pay apps, and reports." },
];

export const PROOF_POINTS = [
  "Project dashboard modeled after real steel PM workflows",
  "Light, executive interface aligned with the attached module mockups",
  "Module-by-module visibility without burying users in navigation",
  "Designed to feel credible in owner, GC, and leadership conversations",
];

export const monoLabel = (extra = {}) => ({
  fontFamily: F.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.muted,
  ...extra,
});

export function Reveal({ children, delay = 0, as: Tag = "div", className = "", style }) {
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

export function BrandMark({ size = 38 }) {
  return (
    <div
      className="lp-brand-mark"
      style={{ width: size, height: size, minWidth: size, borderRadius: Math.max(10, size * 0.26) }}
    >
      SB
    </div>
  );
}

export function ProductMockup() {
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
          <div className="lp-project-pill">Rivergate Logistics Center <span>Project ID: DEMO-001</span></div>
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

