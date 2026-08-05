/**
 * Presentational blocks + content constants for Landing page.
 */
// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import {
  C,
  F,
  HERO_STRIP,
  LOGO_IMG,
  NAV_LINKS,
  EXEC_METRICS,
  VALUE_CARDS,
  MODULES,
  WORKFLOW,
  PROOF_POINTS,
  monoLabel,
} from "./landingPageHelpers";

export {
  C,
  F,
  HERO_STRIP,
  LOGO_IMG,
  NAV_LINKS,
  EXEC_METRICS,
  VALUE_CARDS,
  MODULES,
  WORKFLOW,
  PROOF_POINTS,
  monoLabel,
};

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

