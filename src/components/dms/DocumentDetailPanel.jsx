import React, { useState } from "react";

export default function DocumentDetailPanel({ doc, onClose }) {
  const [activeTab, setActiveTab] = useState("details");

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const fileSizeMB = (doc.fileSizeKb / 1024).toFixed(1);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 400,
        background: "var(--bg-surface-low)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: "2px solid var(--accent-border)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        animation: "slideInRight 0.25s ease-out"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between"
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            {doc.displayName}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent)",
              marginTop: 4
            }}
          >
            {doc.documentNumber} · Rev {doc.revisionNumber || "0"}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "2px 6px",
                background:
                  doc.status === "Approved"
                    ? "rgba(0,214,143,0.15)"
                    : "rgba(255,176,32,0.15)",
                color:
                doc.status === "Approved"
                  ? "var(--status-success)"
                  : "var(--status-warning)",
                borderRadius: 3
              }}
            >
              {doc.status}
            </span>
            {doc.ifc_status && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "rgba(139,92,246,0.15)",
                  color: "#8B5CF6",
                  borderRadius: 3
                }}
              >
                {doc.ifc_status}
              </span>
            )}
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

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          ↓ DOWNLOAD
        </button>
        <button
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(220,225,240,0.70)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          👁 VIEW
        </button>
        <button
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(220,225,240,0.70)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          🔗 SHARE
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {["details", "linked", "versions", "activity"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px 8px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {activeTab === "details" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                DOCUMENT #
              </div>
              <div style={{ color: "#FF9A60", fontFamily: "var(--font-mono)" }}>{doc.documentNumber}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                CATEGORY
              </div>
              <div style={{ color: "var(--text-primary)" }}>{doc.category}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                DISCIPLINE
              </div>
              <div style={{ color: "var(--text-primary)" }}>{doc.discipline}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                REVISION
              </div>
              <div style={{ color: "var(--text-primary)" }}>Rev {doc.revisionNumber || "0"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                FILE TYPE
              </div>
              <div style={{ color: "rgba(220,225,240,0.80)", textTransform: "uppercase" }}>{doc.fileType}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                FILE SIZE
              </div>
              <div style={{ color: "var(--text-primary)" }}>{fileSizeMB} MB</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                STATUS
              </div>
              <div style={{ color: "var(--text-primary)" }}>{doc.status}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                UPLOADED
              </div>
              <div style={{ color: "var(--text-primary)" }}>{formatDate(doc.uploadedDate)}</div>
            </div>
            {doc.drawingNumber && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  DRAWING #
                </div>
                <div style={{ color: "var(--text-primary)" }}>{doc.drawingNumber}</div>
              </div>
            )}
            {doc.approvedBy && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  APPROVED BY
                </div>
                <div style={{ color: "var(--text-primary)" }}>{doc.approvedBy}</div>
              </div>
            )}
            {doc.description && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  DESCRIPTION
                </div>
                <div style={{ color: "var(--text-primary)" }}>{doc.description}</div>
              </div>
            )}
            {doc.tags?.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  TAGS
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: "2px 6px",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                        borderRadius: 3,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "linked" && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
            Linked records section coming soon
          </div>
        )}

        {activeTab === "versions" && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
            Version history coming soon
          </div>
        )}

        {activeTab === "activity" && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
            Activity log coming soon
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}