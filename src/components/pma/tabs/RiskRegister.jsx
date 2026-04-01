import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getRiskSeverity } from "../utils/riskScoring";

const mono = { fontFamily: "var(--font-mono)" };

export default function RiskRegister({ risks = [], onRescore, isScoring = false }) {
  const [expandedRisk, setExpandedRisk] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [recommendations, setRecommendations] = useState({});

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      if (filter === "ALL") return true;
      if (filter === "CRITICAL") return r.score > 15;
      if (filter === "HIGH") return r.score > 9 && r.score <= 15;
      if (filter === "ACT") return r.urgency === "Act Now";
      if (filter === "MONITOR") return r.urgency === "Monitor";
      return true;
    });
  }, [risks, filter]);

  if (!risks || risks.length === 0) {
    return (
      <div
        style={{
          padding: "20px 14px",
          textAlign: "center",
          color: "rgba(160,175,210,0.35)",
          fontFamily: "var(--font-body)",
          fontSize: 11,
        }}
      >
        ✓ No critical risks detected.
      </div>
    );
  }

  const exportCSV = () => {
    const headers = ["Risk", "Category", "Score", "Urgency", "Owner", "Recommendation", "Drivers"];
    const rows = filtered.map((r) => [
      r.title || "",
      r.category || "",
      r.score || "",
      r.urgency || "",
      r.owner || "",
      (recommendations[r.id] || "").replace(/,/g, ";"),
      (r.drivers || []).join(";"),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "risk-register.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestRecommendation = async (risk) => {
    try {
      const prompt = `For this structural steel project risk: ${risk.title} with score ${risk.score} driven by ${risk.drivers?.join(", ")}, what is the single most effective next action a PM can take right now? Be specific. Max 2 sentences.`;
      const res = await base44.functions.invoke("anthropicProxy", { prompt });
      const text = typeof res === "string" ? res : res?.text || res?.content || res?.response || "";
      setRecommendations((prev) => ({ ...prev, [risk.id]: text }));
    } catch (e) {
      setRecommendations((prev) => ({ ...prev, [risk.id]: "No recommendation available." }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <div>
          <div style={{ ...mono, fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase" }}>
            RISK REGISTER
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "rgba(160,175,210,0.25)" }}>AI-scored from live project data</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onRescore}
            disabled={isScoring}
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              borderRadius: 6,
              padding: "4px 8px",
              ...mono,
              fontSize: 7,
              fontWeight: 700,
              color: isScoring ? "var(--text-muted)" : "var(--accent)",
              cursor: isScoring ? "not-allowed" : "pointer",
              opacity: isScoring ? 0.5 : 1,
            }}
          >
            {isScoring ? "⌛ SCORING..." : "↻ RE-SCORE"}
          </button>
          <button
            onClick={exportCSV}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "4px 8px",
              ...mono,
              fontSize: 7,
              fontWeight: 700,
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            EXPORT
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {[
          { id: "ALL", label: "ALL" },
          { id: "CRITICAL", label: "CRITICAL" },
          { id: "HIGH", label: "HIGH" },
          { id: "ACT", label: "ACT NOW" },
          { id: "MONITOR", label: "MONITOR" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: filter === f.id ? "var(--accent-muted)" : "var(--bg-surface)",
              color: filter === f.id ? "var(--accent)" : "var(--text-secondary)",
              ...mono,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Risk matrix */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 10 }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 6 }}>PROBABILITY vs IMPACT</div>
        <svg viewBox="0 0 120 120" width="100%" height="160">
          <defs>
            <linearGradient id="risk-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00D68F" stopOpacity="0.7" />
              <stop offset="50%" stopColor="#FFB400" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#FF3D3D" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <rect x="10" y="10" width="100" height="100" fill="url(#risk-grad)" rx="4" />
          {[1, 2, 3, 4, 5].map((i) => (
            <line key={`v-${i}`} x1={10 + (i - 1) * 20} y1="10" x2={10 + (i - 1) * 20} y2="110" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
          ))}
          {[1, 2, 3, 4, 5].map((i) => (
            <line key={`h-${i}`} x1="10" y1={10 + (i - 1) * 20} x2="110" y2={10 + (i - 1) * 20} stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
          ))}
          {filtered.map((r, idx) => {
            const severity = getRiskSeverity(r.score);
            const x = 10 + ((r.impact || 3) - 1) * 20 + 10;
            const y = 110 - ((r.probability || 3) - 1) * 20 - 10;
            return (
              <g key={r.id || idx}>
                <circle cx={x} cy={y} r="6" fill={severity.color} stroke="#fff" strokeWidth="1.2" />
                <title>{r.title}</title>
              </g>
            );
          })}
          <text x="60" y="122" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">IMPACT →</text>
          <text x="2" y="65" transform="rotate(-90 2 65)" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">PROBABILITY →</text>
        </svg>
      </div>

      {/* Risk cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((risk, idx) => {
          const severity = getRiskSeverity(risk.score);
          const isExpanded = expandedRisk === idx;
          return (
            <div
              key={risk.id || idx}
              onClick={() => setExpandedRisk(isExpanded ? null : idx)}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderLeft: `3px solid ${severity.color}`,
                borderRadius: 8,
                padding: "10px 12px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 9, color: severity.color }}>{severity.label}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>{risk.title}</span>
                <span style={{ marginLeft: "auto", ...mono, fontSize: 9, color: "var(--text-muted)" }}>{risk.score}</span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>Category: {risk.category || "—"}</div>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>Drivers: {(risk.drivers || []).join(", ") || "—"}</div>
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>Owner: {risk.owner || "—"}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestRecommendation(risk);
                    }}
                    style={{
                      background: "var(--accent-muted)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      ...mono,
                      fontSize: 9,
                      cursor: "pointer",
                      width: "fit-content",
                    }}
                  >
                    ✦ Get Recommendation
                  </button>
                  {recommendations[risk.id] && (
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6, padding: 8 }}>
                      {recommendations[risk.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
