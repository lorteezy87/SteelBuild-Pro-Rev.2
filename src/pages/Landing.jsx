import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const problemPoints = [
  "Missed revisions",
  "Slow RFI follow-up",
  "Poor visibility into fabrication and delivery status",
  "Field issues discovered too late",
  "PMs spending too much time chasing updates",
  "Leadership lacking a clear view of project risk",
];

const solutionPoints = [
  "Drawings and revisions",
  "RFIs and submittals",
  "Fabrication status",
  "Deliveries",
  "Schedule and look-ahead planning",
  "Field issues and feedback loops",
  "Cost and project controls",
  "Executive reporting and job health",
];

const outcomePoints = [
  "Reduce confusion around current drawings and revisions",
  "Catch field and coordination issues earlier",
  "Improve handoff between office, shop, and field",
  "Give PMs a clearer view of job status",
  "Help leadership spot schedule, cost, and execution risk sooner",
  "Spend less time hunting for answers across disconnected systems",
];

const audiencePoints = [
  "Structural steel fabricators",
  "Structural steel erectors",
  "PMs and project executives",
  "Shop and field coordination teams",
  "Operations leaders who need better project visibility",
];

const pilotPoints = [
  "Direct onboarding support",
  "Hands-on workflow setup",
  "Priority feedback and issue resolution",
  "Influence on product direction",
  "Early partner pricing",
];

const workflow = ["Detailing", "Fabrication", "Delivery", "Erection"];

const solutionCards = [
  {
    code: "01",
    title: "Drawing Management",
    body: "Track revision history, active set status, approvers, and release state without bouncing between PDFs, emails, and cloud folders.",
    tone: "var(--accent)",
  },
  {
    code: "02",
    title: "Integrated RFI Workflow",
    body: "Connect RFIs, due dates, discipline ownership, and follow-up pressure directly to the project team running the job.",
    tone: "var(--secondary)",
  },
  {
    code: "03",
    title: "Fabrication + Delivery Control",
    body: "Monitor work packages, fabrication progress, trucking readiness, and field handoff from one command surface.",
    tone: "var(--status-warning)",
  },
  {
    code: "04",
    title: "Schedule + Risk Visibility",
    body: "See execution pressure earlier through look-ahead planning, field issues, cost exposure, and executive-level health signals.",
    tone: "var(--status-success)",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const goTo = (page) => navigate(createPageUrl(page));

  useEffect(() => {
    document.title = "SteelBuild-Pro";
  }, []);

  return (
    <div style={pageShell}>
      <style>{responsiveCss}</style>

      <section style={heroSection}>
        <div style={heroTexture} />
        <div style={heroGlowLeft} />
        <div style={heroGlowRight} />

        <div className="landing-hero-grid" style={heroGrid}>
          <div style={heroLeft}>
            <div style={brandRow}>
              <div style={brandMark}>SB</div>
              <div>
                <div style={{ ...eyebrow, color: "var(--secondary)", marginBottom: 4 }}>SteelBuild-Pro</div>
                <div style={brandSub}>Structural steel project controls and operations software</div>
              </div>
            </div>

            <div style={statusPill}>
              <span style={statusDot} />
              <span>System Status: Operational</span>
            </div>

            <div style={{ ...eyebrow, color: "var(--accent)", marginBottom: 16 }}>Industrial precision assured</div>
            <h1 style={heroTitle}>
              Built for <span style={{ color: "var(--accent)" }}>Steel</span>.
              <br />
              Designed for Control.
            </h1>
            <p style={heroBody}>
              Project controls and operations software for structural steel contractors. Manage drawings, RFIs, fabrication,
              deliveries, field issues, schedule, and job risk in one system.
            </p>

            <div style={ctaRow}>
              <button onClick={() => goTo("Projects")} style={primaryBtn}>
                Book a Demo
              </button>
              <button onClick={() => goTo("Dashboard")} style={ghostBtn}>
                Join the Founding Pilot Program
              </button>
            </div>

            <div className="landing-metric-grid" style={metricGrid}>
              <MetricBlock label="Workflow" value="Steel-First" accent="var(--accent)" />
              <MetricBlock label="Control Surface" value="Unified" accent="var(--text-primary)" />
              <MetricBlock label="Risk Visibility" value="Live" accent="var(--secondary)" />
              <MetricBlock label="Office / Shop / Field" value="1 System" accent="var(--status-success)" />
            </div>
          </div>

          <div style={heroPanel}>
            <div style={panelHeader}>
              <div>
                <div style={{ ...eyebrow, color: "var(--secondary)", marginBottom: 4 }}>Execution sequence</div>
                <div style={panelHeaderSub}>A steel-native terminal for project control</div>
              </div>
              <div style={monoPill}>Live Workflow</div>
            </div>

            <div style={heroPanelBody}>
              <div style={workflowBlock}>
                <div style={{ ...sectionCaption, marginBottom: 12 }}>The real sequence of work</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {workflow.map((step, index) => (
                    <div key={step} style={workflowRow}>
                      <div style={{ ...workflowIndex, color: index % 2 === 0 ? "var(--accent)" : "var(--secondary)" }}>
                        0{index + 1}
                      </div>
                      <div
                        style={{
                          ...workflowName,
                          borderLeft: `4px solid ${index % 2 === 0 ? "var(--accent)" : "var(--secondary)"}`,
                        }}
                      >
                        {step}
                      </div>
                      <div style={workflowArrow}>{index < workflow.length - 1 ? "→" : ""}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={terminalBlock}>
                <div style={terminalHeader}>Operational reality</div>
                <div style={terminalLine}>
                  <span style={{ color: "var(--status-error)" }}>$</span>
                  <span>Generic construction platforms were not built around steel workflow.</span>
                </div>
                <div style={terminalLine}>
                  <span style={{ color: "var(--secondary)" }}>{">"}</span>
                  <span>Better visibility, fewer missed handoffs, faster decisions.</span>
                </div>
                <div style={terminalLine}>
                  <span style={{ color: "var(--status-warning)" }}>{">"}</span>
                  <span>Track the office, shop, and field from one execution system.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" style={surfaceSection}>
        <div style={sectionWrap}>
          <div className="landing-two-col" style={twoCol}>
            <div>
              <div style={{ ...sectionCaption, borderLeftColor: "var(--status-error)" }}>Critical system inefficiencies</div>
              <h2 style={sectionTitle}>Structural steel teams do not work in a straight line.</h2>
              <p style={sectionBody}>
                Information moves from estimating to detailing to fabrication to delivery to erection, and most teams are still
                managing it across emails, spreadsheets, PDFs, and disconnected software.
              </p>
            </div>
            <div className="landing-stack-grid" style={stackGrid}>
              {problemPoints.map((item, index) => (
                <StripCard
                  key={item}
                  code={`0${index + 1}`}
                  title={item}
                  body="This failure point compounds across schedule, coordination, and execution risk when the team is operating in disconnected tools."
                  tone="var(--status-error)"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="solution" style={darkSection}>
        <div style={sectionWrap}>
          <div className="landing-two-col" style={twoCol}>
            <div>
              <div style={sectionCaption}>Architectural solution</div>
              <h2 style={sectionTitle}>One place to manage the workflows that actually drive execution.</h2>
              <p style={sectionBody}>
                SteelBuild-Pro gives structural steel contractors one place to manage the workflows that actually drive execution.
              </p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {solutionCards.map((item) => (
                <StripCard key={item.title} code={item.code} title={item.title} body={item.body} tone={item.tone} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="different" style={terminalSection}>
        <div style={sectionWrap}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ ...eyebrow, color: "var(--secondary)", marginBottom: 12 }}>Specialized tooling vs generic platforms</div>
            <h2 style={{ ...sectionTitle, maxWidth: 860, margin: "0 auto" }}>SteelBuild-Pro is designed around the real sequence of work.</h2>
          </div>

          <div className="landing-bento-grid" style={bentoGrid}>
            <div style={bentoLarge}>
              <div style={sectionCaption}>Steel-first architecture</div>
              <p style={{ ...sectionBody, marginTop: 0, maxWidth: "100%" }}>
                Generic construction platforms were not built around steel workflow. SteelBuild-Pro is designed around the real
                sequence of work: Detailing → Fabrication → Delivery → Erection.
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
                {workflow.map((step, index) => (
                  <div key={step} style={bentoStepRow}>
                    <span style={{ ...eyebrow, color: "var(--accent)" }}>Step 0{index + 1}</span>
                    <span style={bentoStepText}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={bentoAccent}>
              <div style={{ ...eyebrow, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>Differentiator</div>
              <div style={accentTitle}>Fewer missed handoffs. Faster decisions.</div>
              <p style={accentBody}>
                The workflow model is steel-native, so the system matches how jobs actually move instead of forcing teams into
                generic construction abstractions.
              </p>
            </div>

            <div style={bentoSmall}>
              <div style={bentoSmallLabel}>Data Density</div>
              <div style={bentoSmallTitle}>Terminal-speed visibility</div>
              <div style={bentoSmallBody}>Dense operational context without relying on endless dashboards and disconnected reports.</div>
            </div>

            <div style={bentoSmall}>
              <div style={bentoSmallLabel}>Workflow Continuity</div>
              <div style={bentoSmallTitle}>Office, shop, field</div>
              <div style={bentoSmallBody}>Better handoff across the people actually responsible for steel execution.</div>
            </div>
          </div>
        </div>
      </section>

      <section style={surfaceSection}>
        <div style={sectionWrap}>
          <div className="landing-two-col" style={twoCol}>
            <div>
              <div style={{ ...sectionCaption, borderLeftColor: "var(--status-success)" }}>Outcomes</div>
              <h2 style={sectionTitle}>Hard outcomes for teams running steel jobs.</h2>
              <p style={sectionBody}>
                With SteelBuild-Pro, your team can reduce confusion, improve handoff, and surface schedule, cost, and execution
                risk sooner.
              </p>
            </div>
            <Checklist items={outcomePoints} tone="var(--status-success)" />
          </div>
        </div>
      </section>

      <section style={darkSection}>
        <div style={sectionWrap}>
          <div className="landing-two-col" style={twoCol}>
            <div>
              <div style={{ ...sectionCaption, borderLeftColor: "var(--secondary)" }}>Who it is for</div>
              <h2 style={sectionTitle}>Built for the teams actually running steel work.</h2>
              <p style={sectionBody}>
                Built for structural steel fabricators, erectors, PMs, project executives, and operations leaders who need better
                project visibility.
              </p>
            </div>
            <div className="landing-audience-grid" style={audienceGrid}>
              {audiencePoints.map((item, index) => (
                <AudienceTile
                  key={item}
                  title={item}
                  tone={[ "var(--accent)", "var(--secondary)", "var(--status-warning)", "var(--text-secondary)", "var(--status-success)" ][index % 5]}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pilot" style={pilotSection}>
        <div style={pilotGlow} />
        <div style={sectionWrap}>
          <div className="landing-two-col" style={twoCol}>
            <div>
              <div style={pilotBadge}>Enrollment Open</div>
              <h2 style={sectionTitle}>Join the founding pilot program.</h2>
              <p style={sectionBody}>
                We are looking for a small number of structural steel contractors to join our founding pilot program.
              </p>
              <div style={ctaRow}>
                <button onClick={() => goTo("Projects")} style={primaryBtn}>
                  Apply for a Pilot
                </button>
                <button onClick={() => goTo("Projects")} style={ghostBtn}>
                  Book a Demo
                </button>
              </div>
            </div>

            <div style={pilotCard}>
              <div style={sectionCaption}>Pilot partners receive</div>
              <Checklist items={pilotPoints} tone="var(--status-warning)" compact />
            </div>
          </div>

          <div style={closingBlock}>
            <h2 style={{ ...sectionTitle, maxWidth: 820 }}>Steel is too complex to manage with disconnected tools.</h2>
            <p style={{ ...sectionBody, maxWidth: 760 }}>
              Run your jobs with a system built for the way steel actually gets done.
            </p>
            <button onClick={() => goTo("Projects")} style={primaryBtn}>
              Book a Demo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricBlock({ label, value, accent }) {
  return (
    <div style={metricBlock}>
      <div style={{ ...eyebrow, color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function StripCard({ code, title, body, tone }) {
  return (
    <div style={{ ...stripCard, borderLeftColor: tone }}>
      <div style={stripCode}>{code}</div>
      <div style={stripTitle}>{title}</div>
      <div style={stripBody}>{body}</div>
    </div>
  );
}

function AudienceTile({ title, tone }) {
  return (
    <div style={{ ...audienceTile, borderBottom: `2px solid ${tone}` }}>
      <div style={{ ...eyebrow, color: tone, marginBottom: 10 }}>Role</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
    </div>
  );
}

function Checklist({ items, tone, compact = false }) {
  return (
    <div style={{ display: "grid", gap: compact ? 8 : 10 }}>
      {items.map((item) => (
        <div key={item} style={{ ...checkRow, padding: compact ? "8px 0" : "10px 0" }}>
          <div style={{ ...checkDot, background: tone, boxShadow: `0 0 8px ${tone}` }} />
          <div style={checkText}>{item}</div>
        </div>
      ))}
    </div>
  );
}

const pageShell = {
  minHeight: "100vh",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
};

const heroSection = {
  position: "relative",
  minHeight: "calc(100vh - 52px)",
  padding: "0 24px",
  overflow: "hidden",
  background: "linear-gradient(180deg, #090A0B 0%, #0C0E11 58%, #111316 100%)",
};

const heroTexture = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
  opacity: 0.08,
  pointerEvents: "none",
};

const heroGlowLeft = {
  position: "absolute",
  left: "-12%",
  top: "8%",
  width: 420,
  height: 420,
  background: "radial-gradient(circle, rgba(255,107,0,0.18), transparent 68%)",
  pointerEvents: "none",
};

const heroGlowRight = {
  position: "absolute",
  right: "-10%",
  top: "12%",
  width: 380,
  height: 380,
  background: "radial-gradient(circle, rgba(0,229,255,0.14), transparent 68%)",
  pointerEvents: "none",
};

const heroGrid = {
  position: "relative",
  maxWidth: 1360,
  margin: "0 auto",
  minHeight: "calc(100vh - 52px)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.08fr) minmax(360px, 0.92fr)",
  gap: 28,
  alignItems: "stretch",
  padding: "42px 0 64px",
};

const heroLeft = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 28,
};

const brandRow = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 22,
};

const brandMark = {
  width: 46,
  height: 46,
  borderRadius: 2,
  background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  fontFamily: "var(--font-display)",
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: "0.1em",
};

const brandSub = {
  fontSize: 12,
  color: "var(--text-muted)",
};

const statusPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.16em",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  marginBottom: 16,
  width: "fit-content",
};

const statusDot = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--secondary)",
  boxShadow: "0 0 10px rgba(0,229,255,0.6)",
};

const heroTitle = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "clamp(48px, 8vw, 92px)",
  lineHeight: 0.9,
  letterSpacing: "-0.06em",
  fontWeight: 900,
  textTransform: "uppercase",
  maxWidth: 900,
};

const heroBody = {
  margin: "18px 0 0",
  maxWidth: 700,
  fontSize: 17,
  lineHeight: 1.75,
  color: "var(--text-secondary)",
};

const ctaRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 28,
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  maxWidth: 840,
};

const metricBlock = {
  background: "rgba(255,255,255,0.03)",
  padding: "14px 14px 12px",
  borderLeft: "4px solid rgba(255,255,255,0.08)",
};

const heroPanel = {
  background: "rgba(13,14,16,0.84)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const panelHeader = {
  padding: "16px 18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "rgba(255,255,255,0.02)",
};

const panelHeaderSub = {
  fontSize: 12,
  color: "var(--text-muted)",
};

const heroPanelBody = {
  padding: 18,
  display: "grid",
  gap: 14,
  flex: 1,
};

const workflowBlock = {
  background: "var(--bg-surface)",
  padding: "14px 14px 16px",
};

const workflowRow = {
  display: "grid",
  gridTemplateColumns: "56px minmax(0,1fr) 20px",
  gap: 12,
  alignItems: "center",
};

const workflowIndex = {
  fontFamily: "var(--font-display)",
  fontSize: 26,
  fontWeight: 800,
};

const workflowName = {
  padding: "10px 12px",
  background: "var(--bg-surface-mid)",
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text-primary)",
};

const workflowArrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-muted)",
};

const terminalBlock = {
  background: "var(--bg-void)",
  padding: "16px 16px 14px",
  minHeight: 180,
};

const terminalHeader = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 10,
};

const terminalLine = {
  display: "grid",
  gridTemplateColumns: "16px minmax(0,1fr)",
  gap: 10,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.8,
  color: "var(--text-secondary)",
  marginBottom: 8,
};

const surfaceSection = {
  padding: "80px 24px",
  background: "var(--bg-surface-low)",
};

const darkSection = {
  padding: "80px 24px",
  background: "var(--bg-page)",
};

const terminalSection = {
  padding: "84px 24px",
  background: "var(--bg-void)",
};

const sectionWrap = {
  maxWidth: 1360,
  margin: "0 auto",
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "minmax(0,0.92fr) minmax(0,1.08fr)",
  gap: 28,
  alignItems: "start",
};

const stackGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const stripCard = {
  background: "var(--bg-surface)",
  padding: "16px 16px 18px",
  borderLeft: "4px solid var(--accent)",
  minHeight: 144,
};

const stripCode = {
  fontFamily: "var(--font-mono)",
  fontSize: 28,
  lineHeight: 1,
  color: "rgba(255,255,255,0.14)",
  marginBottom: 18,
};

const stripTitle = {
  fontFamily: "var(--font-display)",
  fontSize: 21,
  fontWeight: 800,
  letterSpacing: "-0.03em",
  marginBottom: 10,
};

const stripBody = {
  fontSize: 13,
  lineHeight: 1.7,
  color: "var(--text-secondary)",
};

const bentoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gridTemplateRows: "minmax(180px, auto) minmax(180px, auto)",
  gap: 12,
};

const bentoLarge = {
  gridColumn: "span 2",
  gridRow: "span 2",
  background: "var(--bg-surface)",
  padding: 24,
};

const bentoAccent = {
  gridColumn: "span 2",
  background: "linear-gradient(135deg, rgba(255,107,0,0.9), rgba(255,140,56,0.86))",
  color: "#fff",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  minHeight: 180,
};

const accentTitle = {
  fontFamily: "var(--font-display)",
  fontSize: 30,
  lineHeight: 0.95,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const accentBody = {
  fontSize: 14,
  lineHeight: 1.7,
  color: "rgba(255,255,255,0.86)",
  maxWidth: 500,
};

const bentoSmall = {
  background: "var(--bg-surface-mid)",
  padding: 20,
};

const bentoSmallLabel = {
  ...{
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--secondary)",
    marginBottom: 10,
  },
};

const bentoSmallTitle = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  marginBottom: 8,
};

const bentoSmallBody = {
  fontSize: 12,
  lineHeight: 1.7,
  color: "var(--text-secondary)",
};

const bentoStepRow = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0,1fr)",
  gap: 12,
  alignItems: "center",
  padding: "8px 0",
  borderTop: "1px solid rgba(255,255,255,0.05)",
};

const bentoStepText = {
  fontFamily: "var(--font-display)",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const audienceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const audienceTile = {
  background: "var(--bg-surface-mid)",
  padding: 18,
};

const pilotSection = {
  position: "relative",
  padding: "84px 24px 96px",
  background: "linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-page) 100%)",
  overflow: "hidden",
};

const pilotGlow = {
  position: "absolute",
  top: 0,
  right: "-10%",
  width: "48%",
  height: "100%",
  background: "linear-gradient(135deg, rgba(255,107,0,0.06), rgba(0,229,255,0.03))",
  transform: "skewX(-14deg)",
  pointerEvents: "none",
};

const pilotBadge = {
  display: "inline-block",
  background: "var(--accent)",
  color: "#fff",
  padding: "6px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: 18,
};

const pilotCard = {
  background: "var(--bg-void)",
  padding: 20,
  borderLeft: "4px solid var(--status-warning)",
};

const closingBlock = {
  marginTop: 40,
  paddingTop: 26,
  borderTop: "1px solid var(--divider)",
  display: "grid",
  gap: 12,
};

const primaryBtn = {
  background: "var(--accent)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 2,
  padding: "14px 20px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const ghostBtn = {
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  padding: "14px 20px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const monoPill = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

const eyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const sectionCaption = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  borderLeft: "3px solid var(--accent)",
  paddingLeft: 8,
  marginBottom: 14,
};

const sectionTitle = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "clamp(30px, 4.8vw, 58px)",
  lineHeight: 0.94,
  fontWeight: 900,
  letterSpacing: "-0.05em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
};

const sectionBody = {
  margin: "16px 0 0",
  fontSize: 15,
  lineHeight: 1.8,
  color: "var(--text-secondary)",
  maxWidth: 720,
};

const checkRow = {
  display: "grid",
  gridTemplateColumns: "12px minmax(0,1fr)",
  gap: 10,
  alignItems: "start",
  borderBottom: "1px solid var(--divider)",
};

const checkDot = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  marginTop: 7,
};

const checkText = {
  fontSize: 14,
  lineHeight: 1.65,
  color: "var(--text-secondary)",
};

const responsiveCss = `
  .landing-hero-grid {
    grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  }
  .landing-two-col {
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  }
  .landing-bento-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .landing-metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .landing-stack-grid,
  .landing-audience-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 1120px) {
    .landing-hero-grid,
    .landing-two-col {
      grid-template-columns: 1fr !important;
    }
    .landing-bento-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 760px) {
    .landing-metric-grid,
    .landing-stack-grid,
    .landing-audience-grid,
    .landing-bento-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;
