import React, { useState, useMemo } from "react";
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

const ENTITY_LABELS = {
  work_package_id: { label: "Work Package", color: "#0d9488", bg: "rgba(13,148,136,0.12)" },
  rfi_id:          { label: "RFI",          color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  delivery_id:     { label: "Delivery",     color: "#0891b2", bg: "rgba(8,145,178,0.12)" },
  change_order_id: { label: "Change Order", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  submittal_id:    { label: "Submittal",    color: "#eab308", bg: "rgba(234,179,8,0.12)" },
};

export default function DocumentDetailPanel({ doc, allDocuments = [], onClose, onEdit, onDelete }) {
  const [activeTab, setActiveTab] = useState("details");
  const navigate = useNavigate();

  const docNum = doc ? (doc.documentNumber || doc.document_number) : null;
  const versionStack = useMemo(() => {
    if (!docNum || !allDocuments.length) return [];
    return allDocuments
      .filter(d => (d.documentNumber || d.document_number) === docNum)
      .sort((a, b) => {
        const revA = parseInt(a.revisionNumber || a.revision_number || "0", 10) || 0;
        const revB = parseInt(b.revisionNumber || b.revision_number || "0", 10) || 0;
        if (revB !== revA) return revB - revA;
        return new Date(b.uploadedDate || b.created_at || 0) - new Date(a.uploadedDate || a.created_at || 0);
      });
  }, [docNum, allDocuments]);

  const linkedEntities = useMemo(() => {
    if (!doc) return [];
    return Object.entries(ENTITY_LABELS)
      .filter(([key]) => doc[key])
      .map(([key, meta]) => ({ key, value: doc[key], ...meta }));
  }, [doc]);

  if (!doc) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--bg-surface-high)",
        borderLeft: "2px solid var(--accent-border)",
        zIndex: 2000, display: "flex", flexDirection: "column",
        animation: "slideInRight 0.25s ease-out",
      }}
    >
      {/* Header */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--bg-surface-high)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {doc.displayName || doc.display_name || doc.fileName || doc.file_name || "Untitled"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
            {doc.documentNumber || doc.document_number || "\u2014"} {"\u00B7"} Rev {doc.revisionNumber || doc.revision_number || "0"}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", background: statusStyle.bg, color: statusStyle.color, borderRadius: 3 }}>
              {doc.status || "Draft"}
            </span>
            {doc.category && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", background: "var(--bg-surface-high)", color: "var(--text-muted)", borderRadius: 3 }}>
                {doc.category}
              </span>
            )}
            {doc.discipline && doc.discipline !== "General" && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", background: "var(--bg-surface-high)", color: "var(--text-muted)", borderRadius: 3 }}>
                {doc.discipline}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 20, padding: 0, marginLeft: 8 }}>
          {"\u00D7"}
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, padding: 12, borderBottom: "1px solid var(--bg-surface-high)" }}>
        {[
          { label: "DOWNLOAD", handler: handleDownload, accent: true },
          { label: "VIEW",     handler: handleView },
          { label: "SHARE",    handler: handleShare },
          { label: "EDIT",     handler: () => onEdit?.(doc) },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.handler}
            style={{
              flex: 1, padding: "6px 8px",
              background: btn.accent ? "var(--accent-muted)" : "transparent",
              border: btn.accent ? "1px solid var(--accent-border)" : "1px solid var(--border-default)",
              color: btn.accent ? "var(--accent)" : "var(--text-secondary)",
              borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, cursor: "pointer",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--bg-surface-high)" }}>
        {["details", "linked", "versions", "activity"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: "10px 8px", background: "none", border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
            }}
          >
            {tab}
            {tab === "versions" && versionStack.length > 1 && (
              <span style={{ marginLeft: 4, fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(13,148,136,0.15)", color: "#0d9488" }}>
                {versionStack.length}
              </span>
            )}
            {tab === "linked" && linkedEntities.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                {linkedEntities.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

        {/* ── Details Tab ──────────────────────── */}
        {activeTab === "details" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
            {[
              { label: "DOCUMENT #", value: doc.documentNumber || doc.document_number, color: "#FF9A60" },
              { label: "CATEGORY",   value: doc.category },
              { label: "DISCIPLINE", value: doc.discipline },
              { label: "REVISION",   value: "Rev " + (doc.revisionNumber || doc.revision_number || "0") },
              { label: "FILE TYPE",  value: (doc.fileType || doc.file_type || "\u2014").toUpperCase() },
              { label: "FILE SIZE",  value: fileSizeMB + " MB" },
              { label: "STATUS",     value: doc.status || "Draft" },
              { label: "UPLOADED",   value: formatDate(doc.uploadedDate || doc.uploaded_date || doc.created_at) },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                <div style={{ color: color || "var(--text-primary)", fontFamily: color ? "var(--font-mono)" : "var(--font-body)" }}>{value || "\u2014"}</div>
              </div>
            ))}
            {(doc.drawingNumber || doc.drawing_number) && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>DRAWING #</div>
                <div style={{ color: "var(--text-primary)" }}>{doc.drawingNumber || doc.drawing_number}</div>
              </div>
            )}
            {(doc.uploadedBy || doc.uploaded_by) && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>UPLOADED BY</div>
                <div style={{ color: "var(--text-primary)" }}>{doc.uploadedBy || doc.uploaded_by}</div>
              </div>
            )}
            {doc.description && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>DESCRIPTION</div>
                <div style={{ color: "var(--text-primary)", lineHeight: 1.5 }}>{doc.description}</div>
              </div>
            )}
            {doc.tags?.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>TAGS</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(Array.isArray(doc.tags) ? doc.tags : []).map(tag => (
                    <span key={tag} style={{ padding: "2px 6px", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 9 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Linked Tab ──────────────────────── */}
        {activeTab === "linked" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {linkedEntities.length > 0 ? (
              linkedEntities.map(({ key, value, label, color, bg }) => (
                <div key={key} style={{
                  padding: "12px 14px", background: bg,
                  border: `1px solid ${color}33`, borderRadius: 8,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: color, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", marginTop: 3 }}>
                      {value.length > 20 ? value.slice(0, 8) + "..." : value}
                    </div>
                  </div>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, background: `${color}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: color,
                  }}>
                    {"\u2197"}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>{"\uD83D\uDD17"}</div>
                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12, marginBottom: 12 }}>
                  No linked records
                </div>
                <button
                  onClick={() => onEdit?.(doc)}
                  style={{
                    padding: "6px 14px", background: "var(--accent-muted)",
                    border: "1px solid var(--accent-border)", borderRadius: 6,
                    color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9,
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  LINK DOCUMENT
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Versions Tab ─────────────────────── */}
        {activeTab === "versions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {versionStack.length > 1 ? (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 4 }}>
                  {versionStack.length} REVISION{versionStack.length !== 1 ? "S" : ""} OF {docNum}
                </div>
                {versionStack.map((ver, idx) => {
                  const isCurrent = ver.id === doc.id;
                  const isNewest = idx === 0;
                  const revNum = ver.revisionNumber || ver.revision_number || "0";
                  const verDate = formatDate(ver.revisionDate || ver.revision_date || ver.uploadedDate || ver.uploaded_date || ver.created_at);
                  const verStatus = STATUS_COLORS[ver.status] || STATUS_COLORS["Draft"];
                  return (
                    <div
                      key={ver.id}
                      style={{
                        padding: "10px 14px",
                        background: isCurrent ? "rgba(200,155,32,0.06)" : "var(--hover-bg)",
                        border: isCurrent ? "1px solid rgba(200,155,32,0.25)" : "1px solid var(--divider)",
                        borderRadius: 6, cursor: isCurrent ? "default" : "pointer",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = "var(--divider)"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: isCurrent ? "var(--accent)" : "var(--text-primary)" }}>
                            Rev {revNum}
                          </div>
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px",
                            background: verStatus.bg, color: verStatus.color, borderRadius: 3,
                          }}>
                            {ver.status || "Draft"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {isNewest && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", background: "rgba(34,197,94,0.15)", color: "#22c55e", borderRadius: 3 }}>
                              LATEST
                            </span>
                          )}
                          {isCurrent && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", background: "rgba(200,155,32,0.15)", color: "var(--accent)", borderRadius: 3 }}>
                              VIEWING
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                        {verDate} {ver.uploadedBy || ver.uploaded_by ? `\u00B7 ${ver.uploadedBy || ver.uploaded_by}` : ""}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div style={{
                  padding: "10px 14px", background: "var(--hover-bg)",
                  border: "1px solid var(--divider)", borderRadius: 6,
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", background: "rgba(34,197,94,0.15)", color: "#22c55e", borderRadius: 3 }}>
                      CURRENT
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 11 }}>
                  {docNum
                    ? "Upload another revision with the same document number to build version history."
                    : "Set a document number to enable version tracking across revisions."}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Activity Tab ─────────────────────── */}
        {activeTab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>Document uploaded</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {doc.uploadedBy || doc.uploaded_by || "Unknown"} {"\u00B7"} {formatDate(doc.uploadedDate || doc.uploaded_date || doc.created_at)}
                </div>
              </div>
            </div>
            {doc.status !== "Draft" && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: (STATUS_COLORS[doc.status] || STATUS_COLORS.Draft).color, marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                    Status changed to <strong>{doc.status}</strong>
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
