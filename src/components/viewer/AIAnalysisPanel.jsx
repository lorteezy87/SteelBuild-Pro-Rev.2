import React, { useState } from "react";

export default function AIAnalysisPanel({ results, document, onClose, onCreateRFI }) {
  const [expandedSection, setExpandedSection] = useState("priority");

  if (!results) return null;

  const getSeverityColor = (severity) => {
    const colors = {
      critical: "#FF3D3D",
      high: "var(--status-warning)",
      medium: "#FFB020",
      low: "#00B8D9",
      info: "var(--text-muted)"
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
          borderBottom: "1px solid var(--bg-surface-high)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            ✦ AI ANALYSIS
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            Overall Score: {results.overallScore}/100
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
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
          borderBottom: "1px solid var(--bg-surface-high)"
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
                background: "var(--bg-surface-high)",
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>
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
                  borderBottom: "1px solid var(--bg-surface-high)",
                  color: "var(--text-primary)",
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
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span>
                  {section.title} ({section.items.length})
                </span>
                <span>{expandedSection === section.id ? "▾" : "▸"}</span>
              </button>

              {expandedSection === section.id && (
                <div style={{ padding: 12, borderBottom: "1px solid var(--bg-surface-high)" }}>
                  {section.items.map((item) => (
                    <div key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--hover-bg)" }}>
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
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>
                            {item.title || item}
                          </div>
                          {item.description && (
                            <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
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