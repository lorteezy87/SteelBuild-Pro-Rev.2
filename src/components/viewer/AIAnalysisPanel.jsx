import React, { useState } from "react";
import { X, AlertCircle, CheckCircle, Lightbulb } from "lucide-react";

export default function AIAnalysisPanel({ results, document, onClose, onCreateRFI }) {
  const [expandedSection, setExpandedSection] = useState("priority");

  if (!results) return null;

  const getSeverityColor = (severity) => {
    const colors = {
      critical: "#FF3D3D",
      high: "var(--status-warning)",
      medium: "#FFB020",
      low: "#00B8D9",
      info: "rgba(160,175,210,0.50)"
    };
    return colors[severity] || colors.info;
  };

  const sections = [
    {
      id: "priority",
      title: "⚡ TOP ACTIONS",
      items: results.priorityActions?.map((action, idx) => ({
        id: `action-${idx}`,
        title: action,
        severity: "critical"
      })) || []
    },
    {
      id: "completeness",
      title: "📋 COMPLETENESS",
      items: results.completeness?.issues || [],
      score: results.completeness?.score
    },
    {
      id: "coordination",
      title: "🔗 COORDINATION",
      items: results.coordination?.conflicts || [],
      score: results.coordination?.score
    },
    {
      id: "constructability",
      title: "🔨 CONSTRUCTABILITY",
      items: results.constructability?.issues || [],
      score: results.constructability?.score
    },
    {
      id: "positives",
      title: "✓ POSITIVES",
      items: results.positives || [],
      score: null
    }
  ];

  return (
    <div
      style={{
        width: 320,
        background: "var(--bg-sidebar)",
        borderLeft: "2px solid rgba(139,92,246,0.30)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            ✦ AI ANALYSIS
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginTop: 2 }}>
            Overall Score: {results.overallScore}/100
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "rgba(220,225,240,0.60)",
            cursor: "pointer",
            fontSize: 20,
            padding: 0
          }}
        >
          ×
        </button>
      </div>

      {/* Score ring */}
      <div
        style={{
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        {[
          { label: "Complete", score: results.completeness?.score },
          { label: "Coord", score: results.coordination?.score },
          { label: "Construct", score: results.constructability?.score },
          { label: "Code", score: results.codeCompliance?.score },
          { label: "Quality", score: results.drawingQuality?.score }
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "2px solid var(--warning-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--accent)"
              }}
            >
              {item.score || "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.50)", marginTop: 4 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sections.map((section) => (
          section.items && section.items.length > 0 && (
            <div key={section.id}>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === section.id ? null : section.id)
                }
                style={{
                  width: "100%",
                  padding: 12,
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(220,225,240,0.80)",
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "background 0.15s"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span>
                  {section.title} ({section.items.length})
                </span>
                <span>{expandedSection === section.id ? "▾" : "▸"}</span>
              </button>

              {expandedSection === section.id && (
                <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {section.items.map((item) => (
                    <div key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          marginBottom: 6
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: getSeverityColor(item.severity),
                            marginTop: 3,
                            flexShrink: 0
                          }}
                        />
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(220,225,240,0.80)", fontWeight: 600 }}>
                            {item.title || item}
                          </div>
                          {item.description && (
                            <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(160,175,210,0.60)", marginTop: 4 }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.suggestRFI && (
                        <button
                          onClick={() => onCreateRFI(item)}
                          style={{
                            marginTop: 8,
                            padding: "4px 8px",
                            background: "var(--accent-muted)",
                            border: "1px solid var(--accent-border)",
                            color: "var(--accent)",
                            borderRadius: 4,
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            cursor: "pointer"
                          }}
                        >
                          CREATE RFI
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  );
}