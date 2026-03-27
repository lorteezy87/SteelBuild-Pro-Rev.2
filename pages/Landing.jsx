import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FEATURE_CARDS = [
  {
    code: "01_SYSTEM",
    title: "Superhuman Triage",
    desc: "Context-aware RFI & submittal management. AI-driven priority routing ensures no bottleneck survives the fabrication cycle.",
    footer: "Active Telemetry: Enabled",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="13" y="2" width="6" height="6" rx="1"/>
        <rect x="2" y="13" width="6" height="6" rx="1"/>
        <rect x="24" y="13" width="6" height="6" rx="1"/>
        <rect x="13" y="24" width="6" height="6" rx="1"/>
        <line x1="16" y1="8" x2="16" y2="13"/>
        <line x1="8" y1="16" x2="13" y2="16"/>
        <line x1="19" y1="16" x2="24" y2="16"/>
        <line x1="16" y1="19" x2="16" y2="24"/>
      </svg>
    ),
  },
  {
    code: "02_LOGISTICS",
    title: "Motion AI Scheduling",
    desc: "Automated field-linked task blocking. Dynamic adjustment of erection sequences based on real-time site crane capacity and weather logs.",
    footer: "Sync Rate: 12ms",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="26" height="24" rx="1"/>
        <line x1="3" y1="11" x2="29" y2="11"/>
        <line x1="10" y1="3" x2="10" y2="8"/>
        <line x1="22" y1="3" x2="22" y2="8"/>
        <line x1="9" y1="17" x2="14" y2="17"/>
        <line x1="9" y1="22" x2="14" y2="22"/>
        <line x1="18" y1="17" x2="23" y2="17"/>
        <line x1="18" y1="22" x2="23" y2="22"/>
      </svg>
    ),
  },
  {
    code: "03_CONNECT",
    title: "Real-Time Sync",
    desc: "Direct connection to SteelBuild field records. Every weld inspection and bolt-up torque is synced to the executive dashboard instantly.",
    footer: "Protocol: Secure_Forge",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16a10 10 0 0 1 16.5-7.5"/>
        <path d="M26 16a10 10 0 0 1-16.5 7.5"/>
        <polyline points="22 8 26 8 26 12"/>
        <polyline points="10 24 6 24 6 20"/>
        <circle cx="16" cy="16" r="3"/>
      </svg>
    ),
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const featuresRef = useRef(null);

  const goToDashboard = () => navigate(createPageUrl("Dashboard"));
  const scrollToFeatures = () => featuresRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ overflowX: "hidden", background: "var(--bg-void)", minHeight: "100vh" }}>

      {/* ── 1. FIXED HEADER ─────────────────────────────────────────── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--bg-page)",
        borderBottom: "1px solid var(--divider)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 60,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: "var(--accent-hover)", display: "flex",
            alignItems: "center", justifyContent: "center", borderRadius: 2, flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="7" height="7"/>
              <rect x="10" y="1" width="7" height="7"/>
              <rect x="1" y="10" width="7" height="7"/>
              <path d="M10 13.5h7M13.5 10v7"/>
            </svg>
          </div>
          <span style={{
            fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 14,
            letterSpacing: "0.15em", textTransform: "uppercase", color: "#fff",
          }}>STEELBUILD PRO</span>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {[
            { label: "COMMAND", active: true, action: scrollToFeatures },
            { label: "TERMINAL", active: false, action: goToDashboard },
            { label: "LOGISTICS", active: false, action: goToDashboard },
          ].map(({ label, active, action }) => (
            <button key={label} onClick={action} style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
              textTransform: "uppercase", background: "none", border: "none",
              color: active ? "var(--accent)" : "var(--text-muted)",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              paddingBottom: 4, cursor: "pointer", transition: "all 0.15s",
              letterSpacing: "0.08em",
            }}>
              {label}
            </button>
          ))}
        </nav>

        {/* CTA */}
        <button onClick={goToDashboard} style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
          textTransform: "uppercase", letterSpacing: "0.1em",
          background: "var(--accent-hover)", color: "var(--on-accent)",
          border: "none", borderRadius: 2, padding: "8px 20px", cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--accent)"}
        onMouseLeave={e => e.currentTarget.style.background = "var(--accent-hover)"}>
          LAUNCH APP
        </button>
      </header>

      {/* ── 2. HERO SECTION ─────────────────────────────────────────── */}
      <section style={{
        minHeight: 751, position: "relative", display: "flex", alignItems: "center",
        paddingTop: 60, paddingLeft: 48, paddingRight: 48,
        background: `radial-gradient(var(--border-strong) 0.5px, transparent 0.5px)`,
        backgroundSize: "24px 24px",
        backgroundColor: "var(--bg-void)",
        overflow: "hidden",
      }}>
        {/* Background image */}
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuA3uHk9rhWDihEo9hHsfVvCynpUOS6qYRSLEsW7_A_EykGeMmjcfYA6YTAmEvuwqMOU6R5ZOrTG_W2h0CXEqqSKvu1lDa10pXho4djST20E17r1eBrfI65zsJbrlJME0qyv4Aw3Jjbu_BdZUPV8Kt19wb3T_dL5c1-LgbDeQdwZtzymIRRV_aOvdMXZn44daQmwoDtD9O6qbMBT9XNHNSe2mIi2xOjuM-2xyNmijZyqhd9mnBR09tXIgEuKGdD9OT6xJc91jkX9PWQ"
          alt=""
          onError={e => e.currentTarget.style.display = "none"}
          style={{
            position: "absolute", top: 0, right: 0, width: "66%", height: "100%",
            objectFit: "cover", opacity: 0.4, filter: "grayscale(1)",
          }}
        />
        {/* Gradient overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, var(--bg-void) 35%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, var(--bg-void) 0%, transparent 20%, transparent 80%, var(--bg-void) 100%)", pointerEvents: "none" }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, maxWidth: 960 }}>
          <div style={{
            display: "inline-block", border: "1px solid var(--accent-border)",
            background: "var(--accent-muted)", borderRadius: 2,
            padding: "6px 14px", marginBottom: 32,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              STATUS: SYSTEM_READY // FORGE_ACTIVE
            </span>
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 900,
            fontSize: "clamp(48px, 8vw, 96px)", letterSpacing: "-0.04em",
            lineHeight: 0.9, color: "#fff", margin: "0 0 32px",
          }}>
            SteelBuild Pro:<br />
            <span style={{ color: "var(--accent-hover)" }}>Forged in Precision.</span>
          </h1>

          <p style={{
            fontFamily: "var(--font-body)", fontSize: "clamp(16px, 2vw, 24px)",
            color: "var(--text-secondary)", maxWidth: 640,
            borderLeft: "2px solid var(--border-strong)", paddingLeft: 24,
            margin: "0 0 40px", lineHeight: 1.5,
          }}>
            Enterprise-grade command for structural steel fabrication and erection.
            Digital-first logistics for heavy-scale engineering.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button onClick={goToDashboard} style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
              textTransform: "uppercase", letterSpacing: "0.1em",
              background: "#3B82F6", color: "#fff",
              border: "none", borderRadius: 2, padding: "16px 40px", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.1)"}
            onMouseLeave={e => e.currentTarget.style.filter = "brightness(1)"}>
              Request Access
            </button>
            <button onClick={scrollToFeatures} style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
              textTransform: "uppercase", letterSpacing: "0.1em",
              background: "transparent", color: "#fff",
              border: "1px solid var(--text-muted)", borderRadius: 2, padding: "16px 40px", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-surface-high)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              View Specification
            </button>
          </div>
        </div>

        {/* Kinetic data overlay */}
        <div style={{
          position: "absolute", bottom: 32, right: 32, zIndex: 2,
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
          opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.15em",
          lineHeight: 2, textAlign: "right",
        }}>
          <div>LAT: 33.4484° N // LONG: 112.0740° W</div>
          <div>STRUCTURAL_LOAD: OPTIMAL</div>
          <div>REF: SBP_CORE_V.2.04</div>
        </div>
      </section>

      {/* ── 3. SOCIAL PROOF TICKER ──────────────────────────────────── */}
      <section style={{
        background: "var(--bg-sidebar)",
        borderTop: "1px solid var(--divider)", borderBottom: "1px solid var(--divider)",
        padding: "48px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 32,
      }}>
        <p style={{
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.15em", maxWidth: 280,
          lineHeight: 1.6, margin: 0,
        }}>
          Trusted by the world's leading structural engineers and fabricators.
        </p>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "center" }}>
          {["IRON_CORP", "BEAM_FAB", "GRID_WORKS", "APEX_STEEL"].map(name => (
            <span key={name} style={{
              fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24,
              opacity: 0.4, filter: "grayscale(1)", color: "#fff",
            }}>{name}</span>
          ))}
        </div>
      </section>

      {/* ── 4. FEATURE CARDS ────────────────────────────────────────── */}
      <section ref={featuresRef} style={{ background: "var(--bg-page)", padding: "96px 48px" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
              Core Modules
            </div>
            <h2 style={{
              fontFamily: "var(--font-display)", fontWeight: 700, textTransform: "uppercase",
              fontSize: "clamp(32px, 5vw, 56px)", color: "#fff", margin: 0, lineHeight: 1,
            }}>
              The Digital Arsenal
            </h2>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Precision Hierarchy System 01
          </div>
        </div>

        {/* Cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1px", border: "1px solid var(--divider)", background: "var(--divider)",
        }}>
          {FEATURE_CARDS.map((card) => (
            <FeatureCard key={card.code} {...card} />
          ))}
        </div>
      </section>

      {/* ── 5. VALUE PROPOSITION ────────────────────────────────────── */}
      <section style={{
        background: "var(--bg-sidebar)", padding: "128px 48px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Accent shard */}
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "50%",
          background: "var(--accent-muted)",
          transform: "skewX(-12deg) translateX(25%)",
          pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1200, margin: "0 auto", display: "flex",
          gap: 64, flexWrap: "wrap", position: "relative", zIndex: 1,
        }}>
          {/* Left: image */}
          <div style={{ flex: "1 1 400px", position: "relative" }}>
            <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
              {/* Outer accent border */}
              <div style={{
                position: "absolute", inset: -8,
                border: "1px solid var(--accent-border)",
                transform: "scale(1.05)",
                pointerEvents: "none",
              }} />
              {/* Inner frame */}
              <div style={{ border: "2px solid var(--divider)", padding: 16 }}>
                <div style={{ aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuB0znsZuZOzc5UakEn1tq9qi2ioWD_avKpZOWc6iwCPfVf7QR4FE7ZlDF5JepgRgUrAZHXZBpLZVCPU9MSdVkKo-YobxVLkliIQCsEIxaCB8_u81MxEg36w_giszAfolBfwRdppf1z0BgQCE4lpQtLWsalq4raplQnRvuZDZUIliBxWcHHf_VE9v7dnhH35qgP-3mZA27EJLGvVRTaQCZKMTRv31VDl_okoT2MjIi_hNbEk2ybwEohHqHNqKC-krHTWbPVXK4BmEvg"
                    alt=""
                    onError={e => e.currentTarget.style.display = "none"}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover",
                      filter: "grayscale(1) brightness(0.75)",
                    }}
                  />
                  {/* Stat overlay */}
                  <div style={{
                    position: "absolute", bottom: 32, left: 32,
                    background: "var(--bg-page)", padding: 24,
                    borderLeft: "4px solid var(--accent)",
                  }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 }}>99.9%</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6 }}>Operational Accuracy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: copy */}
          <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 }}>
            <h2 style={{
              fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase",
              fontSize: "clamp(28px, 4vw, 56px)", color: "#fff",
              letterSpacing: "-0.04em", lineHeight: 1, margin: 0,
            }}>
              Information density is a feature,{" "}
              <span style={{ color: "var(--accent)" }}>not a bug.</span>
            </h2>

            <p style={{
              fontFamily: "var(--font-body)", fontSize: 18, color: "var(--text-secondary)",
              borderLeft: "2px solid var(--divider)", paddingLeft: 24,
              lineHeight: 1.7, margin: 0,
            }}>
              We don't simplify complexity—we master it. Our terminal provides high-fidelity data
              streams for executive oversight that demands granular visibility into every tonnage increment.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              {[
                { label: "Structure", value: "Rigid Integrity" },
                { label: "Execution", value: "Tactical Precision" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "#fff", textTransform: "uppercase" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. CTA SECTION ──────────────────────────────────────────── */}
      <section style={{
        background: "var(--bg-page)", padding: "96px 24px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase",
            fontSize: "clamp(32px, 5vw, 56px)", color: "#fff",
            letterSpacing: "-0.04em", margin: "0 0 24px",
          }}>
            Ready for the Forge?
          </h2>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 20, color: "var(--text-secondary)",
            margin: "0 0 40px", lineHeight: 1.5,
          }}>
            Join the elite fabricators optimizing their structural workflows with SteelBuild Pro.
          </p>
          <CTAButton onClick={goToDashboard} />
        </div>
      </section>

      {/* ── 7. FOOTER ───────────────────────────────────────────────── */}
      <footer style={{
        background: "var(--bg-sidebar)", borderTop: "1px solid var(--divider)",
        padding: "48px 40px",
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 32, alignItems: "flex-start",
      }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, background: "var(--accent-hover)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}>
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="7" height="7"/>
                <rect x="10" y="1" width="7" height="7"/>
                <rect x="1" y="10" width="7" height="7"/>
                <path d="M10 13.5h7M13.5 10v7"/>
              </svg>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#fff" }}>STEELBUILD PRO</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            © 2025 STEELBUILD PRO. TACTICAL PRECISION ENGINEERED.
          </span>
        </div>

        {/* Center: link columns */}
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          {[
            { heading: "Navigation", links: ["SYSTEM STATUS", "TERMINAL"] },
            { heading: "Resources", links: ["DOCUMENTATION", "RESOURCES"] },
            { heading: "Legal", links: ["PRIVACY"] },
          ].map(({ heading, links }) => (
            <div key={heading} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#fff", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>{heading}</div>
              {links.map(link => (
                <FooterLink key={link} label={link} />
              ))}
            </div>
          ))}
        </div>

        {/* Right: icon buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          {["▸", "◎"].map(icon => (
            <IconBtn key={icon} icon={icon} />
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function FeatureCard({ code, title, desc, footer, icon }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--bg-surface-high)" : "#141416",
        padding: 40,
        transition: "background 0.2s",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{code}</div>
      <div>{icon}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, textTransform: "uppercase",
        color: hovered ? "var(--accent)" : "#fff", transition: "color 0.2s",
      }}>{title}</div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, flex: 1 }}>{desc}</p>
      <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 24, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{footer}</div>
    </div>
  );
}

function CTAButton({ onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 12,
        background: hovered ? "#fff" : "var(--accent)",
        color: hovered ? "#000" : "var(--on-accent)",
        fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20,
        textTransform: "uppercase", letterSpacing: "0.12em",
        padding: "20px 48px", border: "none", borderRadius: 2, cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      Commence Integration
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="10" x2="17" y2="10"/>
        <polyline points="12 5 17 10 12 15"/>
      </svg>
    </button>
  );
}

function FooterLink({ label }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <a
      href="#"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase",
        letterSpacing: "0.08em", textDecoration: "underline",
        color: hovered ? "var(--accent)" : "var(--text-muted)",
        transition: "color 0.15s",
      }}
    >{label}</a>
  );
}

function IconBtn({ icon }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 40, height: 40, border: "1px solid var(--divider)", borderRadius: 2,
        background: hovered ? "var(--bg-surface-high)" : "transparent",
        color: "var(--text-muted)", fontSize: 16, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}
    >{icon}</button>
  );
}