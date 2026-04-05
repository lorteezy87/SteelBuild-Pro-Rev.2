import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const highlightStats = [
  { label: "Projects under management", value: "220+", detail: "Steel, tilt-up, and mixed structural delivery" },
  { label: "Schedule risk reduction", value: "18%", detail: "Average reduction in critical path slip" },
  { label: "QA / QC close-out", value: "99.2%", detail: "Digital traceability from fab to field" },
];

const modules = [
  {
    title: "Fabrication Command",
    body: "Weld maps, cut lists, and NCRs in one pane. Live release gates sync to shop work packages.",
    tag: "Shop Ready",
  },
  {
    title: "Field Execution",
    body: "Erection sequencing, crane picks, and lift plans tied to weather and access constraints.",
    tag: "Site Safe",
  },
  {
    title: "Quality & Compliance",
    body: "Inspection punchlists, photo evidence, torque logs, and turnover packages generated automatically.",
    tag: "Traceable",
  },
  {
    title: "Financial Control",
    body: "SOV, COs, RFIs, and cost codes linked to progress curves. Executive dashboards without spreadsheets.",
    tag: "Commercial Clarity",
  },
];

const workflows = [
  { step: "01", title: "Coordinate", text: "Sync drawings, RFIs, and submittals; route actions to accountable roles." },
  { step: "02", title: "Execute", text: "Release work packages to shop and field with milestone checks and alerts." },
  { step: "03", title: "Verify", text: "Capture QC evidence, inspections, and safety with linked photos and forms." },
  { step: "04", title: "Report", text: "Live status for owners and execs; export sealed close-out without rework." },
];

export default function Landing() {
  const navigate = useNavigate();
  const modulesRef = useRef(null);

  const goDashboard = () => navigate(createPageUrl("Dashboard"));
  const scrollModules = () => modulesRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px", borderBottom: "1px solid var(--border-default)", background: "rgba(12,14,17,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 6,
            background: "linear-gradient(135deg,var(--accent),var(--accent-light))",
            display: "grid", placeItems: "center", color: "var(--on-accent)", fontWeight: 800, fontSize: 14, letterSpacing: "0.06em",
            boxShadow: "var(--shadow-orange-glow)"
          }}>
            SB
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontWeight: 800, letterSpacing: "0.14em", fontSize: 12 }}>STEELBUILD PRO</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Fabrication + Field Command</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <button onClick={scrollModules} style={linkBtn}>Platform</button>
          <button onClick={() => navigate(createPageUrl("Projects"))} style={linkBtn}>Projects</button>
          <button onClick={() => navigate(createPageUrl("RFIs"))} style={linkBtn}>RFIs</button>
          <button onClick={() => navigate(createPageUrl("DrawingViewer"))} style={linkBtn}>Drawings</button>
          <button onClick={goDashboard} style={ctaBtn}>Launch App</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{
        padding: "96px 28px 64px",
        position: "relative",
        overflow: "hidden",
        background: "radial-gradient(circle at 20% 20%, rgba(255,107,0,0.18), transparent 40%), radial-gradient(circle at 80% 0%, rgba(0,229,255,0.10), transparent 45%), var(--bg-page)"
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 32, alignItems: "center" }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--secondary)", margin: "0 0 12px" }}>
              End-to-end steel delivery, one command surface.
            </p>
            <h1 style={{
              fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(42px,6vw,74px)",
              lineHeight: 1.05, margin: "0 0 18px"
            }}>
              The operating system for structural steel.
            </h1>
            <p style={{ fontSize: 18, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 28px" }}>
              SteelBuild Pro unifies fabrication, erection, QA/QC, RFIs, and commercial control so project teams move with precision and evidence.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={goDashboard} style={primaryBtn}>Request a walkthrough</button>
              <button onClick={scrollModules} style={ghostBtn}>View platform modules</button>
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20,
            boxShadow: "var(--shadow-card)"
          }}>
            <div className="ai-texture" style={{ border: "1px solid var(--secondary-border)", borderRadius: 10, padding: 20, background: "var(--bg-void)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--secondary)" }}>Live Controls</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>SteelBuild Terminal</span>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  { label: "Work packages released", value: "312", accent: "var(--secondary)" },
                  { label: "Erection tasks in flight", value: "58", accent: "var(--accent)" },
                  { label: "QA / QC exceptions open", value: "4", accent: "var(--danger)" },
                ].map(({ label, value, accent }) => (
                  <div key={label} style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: accent }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "40px 28px", borderTop: "1px solid var(--border-default)", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {highlightStats.map(({ label, value, detail }) => (
            <div key={label} style={{ padding: 18, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-void)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 30, color: "var(--text-primary)", marginBottom: 6 }}>{value}</div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section ref={modulesRef} style={{ padding: "96px 28px", background: "var(--bg-page)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                Built for heavy steel delivery
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(32px,5vw,52px)", margin: 0 }}>
                Core modules for fabrication, field, and finance.
              </h2>
            </div>
            <button onClick={goDashboard} style={ghostBtn}>Open dashboard</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {modules.map((m) => (
              <div key={m.title} style={{ padding: 20, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-card)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{m.tag}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 10 }}>{m.title}</div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)" }}>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section style={{ padding: "72px 28px", background: "var(--bg-surface)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {workflows.map(({ step, title, text }) => (
            <div key={step} style={{ padding: 18, border: "1px solid var(--border-default)", borderRadius: 10, background: "var(--bg-page)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--secondary)", letterSpacing: "0.12em", marginBottom: 6 }}>Step {step}</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "88px 28px", background: "linear-gradient(135deg,var(--bg-surface),var(--bg-page))" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", border: "1px solid var(--border-default)", borderRadius: 12, padding: 36, background: "var(--bg-void)", boxShadow: "var(--shadow-card)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(28px,4vw,44px)", margin: "0 0 12px" }}>
            Build the safest, fastest steel projects of your portfolio.
          </h3>
          <p style={{ margin: "0 0 26px", fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Request a guided session with our team to see your project data inside SteelBuild Pro in under a day.
          </p>
          <button onClick={goDashboard} style={primaryBtn}>Schedule a session</button>
        </div>
      </section>
    </div>
  );
}

const linkBtn = {
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.04em",
  cursor: "pointer",
  padding: 0,
};

const ctaBtn = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontWeight: 800,
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "10px 18px",
  cursor: "pointer",
  boxShadow: "var(--shadow-orange-glow)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const primaryBtn = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontWeight: 800,
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "14px 26px",
  cursor: "pointer",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxShadow: "var(--shadow-orange-glow)",
};

const ghostBtn = {
  background: "transparent",
  color: "var(--text-primary)",
  fontWeight: 700,
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-btn)",
  padding: "14px 26px",
  cursor: "pointer",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
