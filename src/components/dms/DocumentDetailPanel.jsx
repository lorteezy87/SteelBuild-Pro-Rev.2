import React, { useState } from "react";
import { resolveFileUrl } from "@/api/base44Client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_COLORS = {
  "Draft":                   { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
  "Under Review":            { bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  "Approved":                { bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  "Approved with Comments":  { bg: "rgba(34,197,94,0.10)",   color: "#4ade80" },
  "Revise & Resubmit":       { bg: "rgba(249,115,22,0.15)", color: "#f97316" },
  "Rejected":                { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  "Superseded":              { bg: "rgba(100,116,139,0.10)", color: "#64748b" },
  "Issued":                  { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  "Archived":                { bg: "rgba(100,116,139,0.08)", color: "#475569" },
  "Void":                    { bg: "rgba(239,68,68,0.08)",   color: "#dc2626" },
};

export default function DocumentDetailPanel({ doc, onClose, onEdit, onDelete }) {
  const [activeTab, setActiveTab] = useState("details");
  const navigate = useNavigate();

  if (!doc) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const fileSizeKb = doc.fileSizeKb ?? doc.file_size_kb ?? 0;
  const fileSizeMB = fileSizeKb ? (fileSizeKb / 1024).toFixed(1) : "0.0";
  const statusStyle = STATUS_COLORS[doc.status] || STATUS_COLORS["Draft"];

  const handleDownload = async () => {
    try {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) { toast.error("No file URL available"); return; }
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName || doc.file_name || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error("Download failed");
    }
  };

  const handleView = () => {
    navigate(createPageUrl("DrawingViewer") + "?docId=" + doc.id);
  };

  const handleShare = async () => {
    try {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) { toast.error("No file URL available"); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard (valid 1 hour)");
    } catch (err) {
      toast.error("Failed to generate share link");
    }
  };

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
            {doc.displayName || doc.display_name || doc.fileName || doc.file_name || "Untitled"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent)",
              marginTop: 4
            }}
          >
            {doc.documentNumber || doc.document_number || "\u2014"} · Rev {doc.revisionNumber || doc.revision_number || "0"}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "2px 6px",
                background: statusStyle.bg,
                color: statusStyle.color,
                borderRadius: 3
              }}
            >
              {doc.status || "Draft"}
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

      {/* Action buttons — now functional */}
      <div style={{ display: "flex", gap: 6, padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={handleDownload}
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
          DOWNLOAD
        </button>
        <button
          onClick={handleView}
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
          VIEW
        </button>
        <button
          onClick={handleShare}
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
          SHARE
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
              <div style={{ color: "#FF9A60", fontFamily: "var(--font-mono)" }}>{doc.documentNumber || doc.document_number || "\u2014"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                CATEGORY
              </div>
              <div style={{ color: "var(--text-primary)" }}>{doc.category || "\u2014"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                DISCIPLINE
              </div>
              <div style={{ color: "var(--text-primary)" }}>{doc.discipline || "\u2014"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                REVISION
              </div>
              <div style={{ color: "var(--text-primary)" }}>Rev {doc.revisionNumber || doc.revision_number || "0"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                FILE TYPE
              </div>
              <div style={{ color: "rgba(220,225,240,0.80)", textTransform: "uppercase" }}>{doc.fileType || doc.file_type || "\u2014"}</div>
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
              <div style={{ color: "var(--text-primary)" }}>{doc.status || "Draft"}</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                UPLOADED
              </div>
              <div style={{ color: "var(--text-primary)" }}>{formatDate(doc.uploadedDate || doc.uploaded_date || doc.created_at)}</div>
            </div>
            {(doc.drawingNumber || doc.drawing_number) && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  DRAWING #
                </div>
                <div style={{ color: "var(--text-primary)" }}>{doc.drawingNumber || doc.drawing_number}</div>
              </div>
            )}
            {(doc.uploadedBy || doc.uploaded_by) && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.50)", marginBottom: 3 }}>
                  UPLOADED BY
                </div>
                <div style={{ color: "var(--text-primary)" }}>{doc.uploadedBy || doc.uploaded_by}</div>
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
                  {(Array.isArray(doc.tags) ? doc.tags : []).map((tag) => (
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { key: "work_package_id", label: "Work Package" },
              { key: "rfi_id", label: "RFI" },
              { key: "delivery_id", label: "Delivery" },
              { key: "change_order_id", label: "Change Order" },
              { key: "submittal_id", label: "Submittal" },
            ].map(({ key, label }) => {
              const val = doc[key];
              if (!val) return null;
              return (
                <div key={key} style={{
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{val}</div>
                  </div>
                </div>
              );
            }).filter(Boolean)}
            {!doc.work_package_id && !doc.rfi_id && !doc.delivery_id && !doc.change_order_id && !doc.submittal_id && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                No linked records. Use Edit to link this document.
              </div>
            )}
          </div>
        )}

        {activeTab === "versions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                    Rev {doc.revisionNumber || doc.revision_number || "0"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                    {formatDate(doc.revisionDate || doc.revision_date || doc.uploadedDate || doc.uploaded_date || doc.created_at)}
                  </div>
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px",
                  background: "rgba(34,197,94,0.15)", color: "#22c55e", borderRadius: 3,
                }}>CURRENT</span>
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 11 }}>
              Upload a new revision to track version history.
            </div>
          </div>
        )}

        {activeTab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: "var(--accent)",
                marginTop: 4, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                  Document uploaded
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {doc.uploadedBy || doc.uploaded_by || "Unknown"} · {formatDate(doc.uploadedDate || doc.uploaded_date || doc.created_at)}
                </div>
              </div>
            </div>
            {doc.status !== "Draft" && (
              <div style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#eab308",
                  marginTop: 4, flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                    Status changed to {doc.status}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                    {formatDate(doc.updated_at || doc.created_at)}
                  </div>
                </div>
              </div>
            )}
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
