/**
 * LinkedFolderBrowser.jsx -- import queue browser for a linked folder.
 *
 * A panel/drawer that shows files discovered in a linked external folder,
 * letting users approve, reject, skip, or import them into the project's
 * document store. Designed to be rendered inside a modal or side drawer.
 */

import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateEntity, invalidateEntities } from "@/services/cacheRegistry";
import {
  X, CheckCircle, XCircle, Download, RotateCcw,
  FileText, Image, FileSpreadsheet, File, Clock, SkipForward,
} from "lucide-react";

// ── Provider labels ───────────────────────────────────────────────────
const PROVIDER_LABELS = {
  sharepoint: "SharePoint",
  onedrive: "OneDrive",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
};

// ── File icon helper ──────────────────────────────────────────────────
function fileIcon(mimeType) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return Image;
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) return FileSpreadsheet;
  return FileText;
}

// ── Format file size ──────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes == null) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Format date ───────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Status config ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: "Pending",  color: "var(--warning)",      bg: "rgba(234,179,8,0.1)" },
  approved: { label: "Approved", color: "var(--success)",      bg: "rgba(34,197,94,0.1)" },
  rejected: { label: "Rejected", color: "var(--status-error)", bg: "rgba(239,68,68,0.1)" },
  imported: { label: "Imported", color: "var(--accent)",       bg: "var(--accent-muted)" },
  skipped:  { label: "Skipped",  color: "var(--text-muted)",   bg: "var(--bg-surface-low)" },
};

export default function LinkedFolderBrowser({
  projectId,
  folderId,
  folderName,
  provider,
  onClose,
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());

  // ── Data ────────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["document-import-queue", projectId, folderId],
    queryFn: () =>
      base44.entities.DocumentImportQueue.filter({
        project_id: projectId,
        linked_folder_id: folderId,
      }),
    enabled: !!projectId && !!folderId,
  });

  // ── KPIs ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const counts = { total: items.length, pending: 0, approved: 0, imported: 0 };
    items.forEach((item) => {
      if (item.import_status === "pending")  counts.pending++;
      if (item.import_status === "approved") counts.approved++;
      if (item.import_status === "imported") counts.imported++;
    });
    return counts;
  }, [items]);

  // ── Mutations ───────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }) =>
      base44.entities.DocumentImportQueue.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "document_import", projectId);
    },
    onError: (e) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  const importMut = useMutation({
    mutationFn: async ({ queueItem }) => {
      // 1. Create a document record
      const doc = await base44.entities.Document.create({
        project_id: projectId,
        title: queueItem.file_name,
        file_name: queueItem.file_name,
        file_size: queueItem.file_size,
        mime_type: queueItem.mime_type,
        external_provider: provider,
        external_file_id: queueItem.external_file_id,
        source: "linked_folder",
      });
      // 2. Update queue item to imported
      await base44.entities.DocumentImportQueue.update(queueItem.id, {
        import_status: "imported",
        reviewed_at: new Date().toISOString(),
        created_document_id: doc.id,
      });
      return doc;
    },
    onSuccess: () => {
      invalidateEntities(qc, ["document_import", "document"], projectId);
      toast.success("File imported to documents");
    },
    onError: (e) => toast.error("Import failed: " + (e?.message || "Unknown error")),
  });

  // ── Handlers ────────────────────────────────────────────────────────
  const setStatus = (id, status) => {
    updateMut.mutate({
      id,
      data: {
        import_status: status,
        reviewed_at: new Date().toISOString(),
      },
    });
  };

  const handleImport = (item) => {
    importMut.mutate({ queueItem: item });
  };

  const handleBulkAction = (status) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    Promise.all(
      ids.map((id) =>
        base44.entities.DocumentImportQueue.update(id, {
          import_status: status,
          reviewed_at: now,
        })
      )
    )
      .then(() => {
        invalidateEntity(qc, "document_import", projectId);
        toast.success(`${ids.length} file(s) ${status}`);
        setSelected(new Set());
      })
      .catch((e) => toast.error("Bulk update failed: " + (e?.message || "Unknown error")));
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingIds = items
      .filter((i) => i.import_status === "pending")
      .map((i) => i.id);
    if (selected.size === pendingIds.length && pendingIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const pendingCount = items.filter((i) => i.import_status === "pending").length;
  const allPendingSelected = pendingCount > 0 && selected.size === pendingCount;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      maxHeight: "80vh",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            {folderName}
          </h3>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "1px 5px",
            background: "var(--bg-surface-low)",
            borderRadius: 3,
          }}>
            {PROVIDER_LABELS[provider] || provider}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} style={iconBtnStyle} title="Close">
            <X size={16} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
          </button>
        )}
      </div>

      {/* KPI row */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--border-default)",
        flexShrink: 0,
      }}>
        {[
          { label: "Total", value: kpis.total, color: "var(--text-primary)" },
          { label: "Pending", value: kpis.pending, color: "var(--warning)" },
          { label: "Approved", value: kpis.approved, color: "var(--success)" },
          { label: "Imported", value: kpis.imported, color: "var(--accent)" },
        ].map((kpi, i) => (
          <div
            key={kpi.label}
            style={{
              flex: 1,
              padding: "10px 14px",
              textAlign: "center",
              borderRight: i < 3 ? "1px solid var(--border-default)" : "none",
            }}
          >
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              fontWeight: 700,
              color: kpi.color,
              lineHeight: 1.2,
            }}>
              {kpi.value}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginTop: 2,
            }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bulk actions bar */}
      {pendingCount > 0 && (
        <div style={{
          padding: "8px 18px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--bg-surface-low)",
          flexShrink: 0,
        }}>
          <label style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-secondary)",
            cursor: "pointer",
            userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={toggleSelectAll}
              style={{ accentColor: "var(--accent)" }}
            />
            Select All Pending
          </label>
          {selected.size > 0 && (
            <>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}>
                {selected.size} selected
              </span>
              <button
                onClick={() => handleBulkAction("approved")}
                style={{
                  ...smallBtnStyle,
                  color: "var(--success)",
                  borderColor: "var(--success)",
                }}
              >
                <CheckCircle size={11} />
                Approve Selected
              </button>
              <button
                onClick={() => handleBulkAction("rejected")}
                style={{
                  ...smallBtnStyle,
                  color: "var(--status-error)",
                  borderColor: "var(--status-error)",
                }}
              >
                <XCircle size={11} />
                Reject Selected
              </button>
            </>
          )}
        </div>
      )}

      {/* File list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {isLoading ? (
          <div style={{
            textAlign: "center",
            padding: 30,
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            Loading import queue...
          </div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: 30,
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            No files in the import queue. Run a sync to discover files from this folder.
          </div>
        ) : (
          items.map((item, idx) => {
            const Icon = fileIcon(item.mime_type);
            const statusCfg = STATUS_CONFIG[item.import_status] || STATUS_CONFIG.pending;
            const isPending = item.import_status === "pending";
            const isApproved = item.import_status === "approved";
            const isRestorable = item.import_status === "rejected" || item.import_status === "skipped";

            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 18px",
                  borderBottom: idx < items.length - 1 ? "1px solid var(--border-default)" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Checkbox (only for pending) */}
                <div style={{ width: 20, flexShrink: 0 }}>
                  {isPending && (
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                  )}
                </div>

                {/* File icon */}
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />

                {/* File info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {item.file_name}
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 2,
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}>
                      {formatSize(item.file_size)}
                    </span>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}>
                      <Clock size={9} strokeWidth={2} />
                      {formatDate(item.last_modified_at || item.created_date)}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 600,
                  color: statusCfg.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "2px 6px",
                  background: statusCfg.bg,
                  borderRadius: 3,
                  flexShrink: 0,
                }}>
                  {statusCfg.label}
                </span>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {isPending && (
                    <>
                      <button
                        onClick={() => setStatus(item.id, "approved")}
                        title="Approve"
                        style={iconBtnStyle}
                      >
                        <CheckCircle size={14} strokeWidth={2} style={{ color: "var(--success)" }} />
                      </button>
                      <button
                        onClick={() => setStatus(item.id, "rejected")}
                        title="Reject"
                        style={iconBtnStyle}
                      >
                        <XCircle size={14} strokeWidth={2} style={{ color: "var(--status-error)" }} />
                      </button>
                      <button
                        onClick={() => setStatus(item.id, "skipped")}
                        title="Skip"
                        style={iconBtnStyle}
                      >
                        <SkipForward size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                      </button>
                    </>
                  )}
                  {isApproved && (
                    <>
                      <button
                        onClick={() => handleImport(item)}
                        title="Import to documents"
                        disabled={importMut.isPending}
                        style={iconBtnStyle}
                      >
                        <Download size={14} strokeWidth={2} style={{ color: "var(--accent)" }} />
                      </button>
                      <button
                        onClick={() => setStatus(item.id, "rejected")}
                        title="Reject"
                        style={iconBtnStyle}
                      >
                        <XCircle size={14} strokeWidth={2} style={{ color: "var(--status-error)" }} />
                      </button>
                    </>
                  )}
                  {isRestorable && (
                    <button
                      onClick={() => setStatus(item.id, "pending")}
                      title="Restore to pending"
                      style={iconBtnStyle}
                    >
                      <RotateCcw size={14} strokeWidth={2} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────

const iconBtnStyle = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "1px solid transparent",
  borderRadius: 6,
  cursor: "pointer",
  transition: "all 120ms",
};

const smallBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 8px",
  background: "none",
  border: "1px solid var(--border-default)",
  borderRadius: 5,
  fontFamily: "var(--font-body)",
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 120ms",
};
