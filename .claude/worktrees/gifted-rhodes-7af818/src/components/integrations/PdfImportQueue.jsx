/**
 * PdfImportQueue.jsx
 *
 * Review queue UI for PDF imports. Shows pending imports with detected
 * item breakdowns, confidence scores, and approve/reject controls.
 *
 * This component enforces the "human approval before writes" governance
 * rule: AI extraction detects items but does NOT auto-create records.
 * A human must review and explicitly approve each import.
 *
 * Mounting: used as a panel/tab on the Integrations page and as a
 * standalone drawer accessible from Drawings and Documents pages.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Inbox,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  addToQueue,
  approveItem,
  bulkApprove,
  clearProcessed,
  detectSourceType,
  DETECTED_ITEM_TYPES,
  getQueueStats,
  listQueueItems,
  QUEUE_STATUSES,
  rejectItem,
  SOURCE_TYPES,
  sourceTypeLabel,
} from "@/lib/integrations/pdfImportQueue";

import {
  generateMarkupExportPackage,
  suggestExportFilename,
} from "@/lib/integrations/markupExport";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

// ── Source type display config ──────────────────────────────────────────────

const SOURCE_ICONS = {
  [SOURCE_TYPES.BLUEBEAM_CSV]: { label: "Bluebeam CSV", color: "#3B82F6" },
  [SOURCE_TYPES.BLUEBEAM_PDF]: { label: "Bluebeam PDF", color: "#3B82F6" },
  [SOURCE_TYPES.PLANGRID]: { label: "PlanGrid", color: "#F59E0B" },
  [SOURCE_TYPES.GENERIC_PDF]: { label: "PDF", color: "var(--text-muted)" },
};

const ITEM_TYPE_LABELS = {
  [DETECTED_ITEM_TYPES.RFI]: { label: "RFI", color: "var(--status-warning)" },
  [DETECTED_ITEM_TYPES.DRAWING]: { label: "Drawing", color: AI },
  [DETECTED_ITEM_TYPES.MARKUP]: { label: "Markup", color: "var(--accent)" },
  [DETECTED_ITEM_TYPES.DOCUMENT]: { label: "Document", color: "var(--text-muted)" },
};

// ── Main component ──────────────────────────────────────────────────────────

export default function PdfImportQueue({
  projectId,
  projectName,
  projectNumber,
  onRecordCreated,
  compact = false,
}) {
  const [items, setItems] = useState(() => listQueueItems(projectId));
  const [stats, setStats] = useState(() => getQueueStats(projectId));
  const [statusFilter, setStatusFilter] = useState(QUEUE_STATUSES.PENDING);
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(null); // id of item being processed, or "bulk"
  const [exportBusy, setExportBusy] = useState(false);
  const fileInput = useRef(null);

  const reload = useCallback(() => {
    setItems(listQueueItems(projectId));
    setStats(getQueueStats(projectId));
  }, [projectId]);

  const filtered = useMemo(() => {
    if (!statusFilter) return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const pendingCount = stats.pending || 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    (file) => {
      if (!file) return;
      if (!projectId) {
        toast.error("Select a project first.");
        return;
      }

      const sourceType = detectSourceType(file.name);

      // For now, add to queue with empty detected_items.
      // A real extraction pipeline (RFI log import, drawing AI extraction)
      // would populate detected_items. The queue still serves as the
      // staging area for manual triage of any PDF upload.
      const item = addToQueue({
        file_name: file.name,
        file_url: null,
        source_type: sourceType,
        project_id: projectId,
        detected_items: [
          {
            type: DETECTED_ITEM_TYPES.DOCUMENT,
            title: file.name.replace(/\.[^.]+$/, ""),
            confidence: null,
          },
        ],
      });

      toast.success(`"${file.name}" added to review queue.`);
      reload();
    },
    [projectId, reload]
  );

  const handleApprove = useCallback(
    async (itemId) => {
      setBusy(itemId);
      try {
        const result = await approveItem(projectId, itemId);
        toast.success(
          `Approved: ${result.created.length} record${result.created.length === 1 ? "" : "s"} created.`
        );
        onRecordCreated?.(result.created);
        reload();
      } catch (e) {
        toast.error(e?.message || "Approve failed.");
      } finally {
        setBusy(null);
      }
    },
    [projectId, reload, onRecordCreated]
  );

  const handleReject = useCallback(
    (itemId) => {
      try {
        rejectItem(projectId, itemId);
        toast("Item rejected.");
        reload();
      } catch (e) {
        toast.error(e?.message || "Reject failed.");
      }
    },
    [projectId, reload]
  );

  const handleBulkApprove = useCallback(async () => {
    if (pendingCount === 0) return;
    setBusy("bulk");
    try {
      const result = await bulkApprove(projectId);
      toast.success(
        `Bulk approved ${result.approved} item${result.approved === 1 ? "" : "s"}, ${result.created.length} record${result.created.length === 1 ? "" : "s"} created.`
      );
      onRecordCreated?.(result.created);
      reload();
    } catch (e) {
      toast.error(e?.message || "Bulk approve failed.");
    } finally {
      setBusy(null);
    }
  }, [projectId, pendingCount, reload, onRecordCreated]);

  const handleClearProcessed = useCallback(() => {
    const { removed } = clearProcessed(projectId);
    if (removed > 0) {
      toast(`Cleared ${removed} processed item${removed === 1 ? "" : "s"}.`);
      reload();
    }
  }, [projectId, reload]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={16} color={AI} />
          <span style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            PDF Import Review Queue
          </span>
          {pendingCount > 0 && (
            <span
              style={{
                ...mono,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 10,
                background: `color-mix(in srgb, ${AI} 18%, transparent)`,
                color: AI,
              }}
            >
              {pendingCount} PENDING
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => fileInput.current?.click()} style={btnSmall}>
            <Upload size={12} /> ADD FILE
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.csv,.tsv,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              handleFileUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {pendingCount > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={busy === "bulk"}
              style={{ ...btnSmall, background: "var(--status-success)", color: "#fff", borderColor: "var(--status-success)" }}
            >
              {busy === "bulk" ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
              APPROVE ALL ({pendingCount})
            </button>
          )}
          <button onClick={handleClearProcessed} style={btnSmall} title="Clear approved/rejected items">
            <RefreshCw size={12} /> CLEAR DONE
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {!compact && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatChip
            label="Total"
            value={stats.total}
            active={!statusFilter}
            onClick={() => setStatusFilter(null)}
          />
          <StatChip
            label="Pending"
            value={stats.pending}
            color="var(--status-warning)"
            active={statusFilter === QUEUE_STATUSES.PENDING}
            onClick={() => setStatusFilter(QUEUE_STATUSES.PENDING)}
          />
          <StatChip
            label="Approved"
            value={stats.approved}
            color="var(--status-success)"
            active={statusFilter === QUEUE_STATUSES.APPROVED}
            onClick={() => setStatusFilter(QUEUE_STATUSES.APPROVED)}
          />
          <StatChip
            label="Rejected"
            value={stats.rejected}
            color="var(--status-error)"
            active={statusFilter === QUEUE_STATUSES.REJECTED}
            onClick={() => setStatusFilter(QUEUE_STATUSES.REJECTED)}
          />
        </div>
      )}

      {/* Queue list */}
      {filtered.length === 0 ? (
        <EmptyQueue statusFilter={statusFilter} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onApprove={() => handleApprove(item.id)}
              onReject={() => handleReject(item.id)}
              busy={busy === item.id}
            />
          ))}
        </div>
      )}

      {/* Governance note */}
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 4,
            border: `1px solid color-mix(in srgb, ${AI} 20%, var(--border-default))`,
            background: `color-mix(in srgb, ${AI} 4%, transparent)`,
          }}
        >
          <Shield size={14} color={AI} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
            <strong style={{ color: AI }}>Governance:</strong> AI extraction is assistive only.
            Records are created only when a human explicitly approves each import.
            Source-file lineage is tracked on every created record.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatChip({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "4px 12px",
        borderRadius: 2,
        border: `1px solid ${active ? (color || AI) : "var(--border-default)"}`,
        background: active ? `color-mix(in srgb, ${color || AI} 12%, transparent)` : "transparent",
        color: active ? (color || AI) : "var(--text-muted)",
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      {label} {value}
    </button>
  );
}

function EmptyQueue({ statusFilter }) {
  const label = statusFilter
    ? `No ${statusFilter} items in the queue.`
    : "Import queue is empty.";

  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        border: "1px dashed var(--border-default)",
        borderRadius: 4,
      }}
    >
      <Inbox size={28} color="var(--text-muted)" style={{ marginBottom: 8 }} />
      <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
        Upload a PDF or CSV to begin. AI extraction detects RFIs, drawings, and markups.
      </div>
    </div>
  );
}

function QueueRow({ item, expanded, onToggle, onApprove, onReject, busy }) {
  const isPending = item.status === QUEUE_STATUSES.PENDING;
  const sourceConfig = SOURCE_ICONS[item.source_type] || SOURCE_ICONS[SOURCE_TYPES.GENERIC_PDF];

  // Count detected items by type.
  const typeCounts = {};
  for (const d of item.detected_items || []) {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
  }

  return (
    <div
      style={{
        border: `1px solid ${isPending ? `color-mix(in srgb, ${AI} 20%, var(--border-default))` : "var(--border-default)"}`,
        borderRadius: 4,
        background: "var(--bg-surface-secondary)",
        overflow: "hidden",
      }}
    >
      {/* Summary row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
        }}
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown size={14} color="var(--text-muted)" />
        ) : (
          <ChevronRight size={14} color="var(--text-muted)" />
        )}

        <FileText size={14} color={sourceConfig.color} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...mono,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.file_name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <span
              style={{
                ...mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: sourceConfig.color,
                textTransform: "uppercase",
              }}
            >
              {sourceConfig.label}
            </span>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
              {new Date(item.upload_date).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Detected item type chips */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const cfg = ITEM_TYPE_LABELS[type] || { label: type, color: "var(--text-muted)" };
            return (
              <span
                key={type}
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 2,
                  border: `1px solid ${cfg.color}`,
                  color: cfg.color,
                }}
              >
                {count} {cfg.label}
              </span>
            );
          })}
        </div>

        {/* Status badge */}
        <StatusBadge status={item.status} />

        {/* Actions */}
        {isPending && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={onApprove} disabled={busy} style={btnAction("var(--status-success)")} title="Approve">
              {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
            </button>
            <button onClick={onReject} disabled={busy} style={btnAction("var(--status-error)")} title="Reject">
              <XCircle size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--divider)", padding: "10px 14px 14px 38px" }}>
          {(item.detected_items || []).length === 0 ? (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              No items detected. Upload may need manual classification.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                DETECTED ITEMS ({item.detected_items.length})
              </div>
              {item.detected_items.map((d) => (
                <DetectedItemRow key={d.id} item={d} />
              ))}
            </div>
          )}

          {/* Lineage info */}
          {item.reviewed_by && (
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
              Reviewed by {item.reviewed_by} on{" "}
              {item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString() : "—"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetectedItemRow({ item }) {
  const cfg = ITEM_TYPE_LABELS[item.type] || { label: item.type, color: "var(--text-muted)" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 2,
        background: "var(--bg-page)",
      }}
    >
      <span
        style={{
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 2,
          background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
          color: cfg.color,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          flexShrink: 0,
        }}
      >
        {cfg.label}
      </span>

      <div
        style={{
          flex: 1,
          ...mono,
          fontSize: 11,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.title || "Untitled"}
      </div>

      {item.sheet && (
        <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
          Sheet: {item.sheet}
        </span>
      )}

      {item.confidence != null && (
        <ConfidencePill value={item.confidence} />
      )}
    </div>
  );
}

function ConfidencePill({ value }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "var(--status-success)"
      : pct >= 50
        ? "var(--status-warning)"
        : "var(--status-error)";

  return (
    <span
      style={{
        ...mono,
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 2,
        border: `1px solid ${color}`,
        color,
      }}
    >
      {pct}%
    </span>
  );
}

function StatusBadge({ status }) {
  const config = {
    [QUEUE_STATUSES.PENDING]: { label: "PENDING", color: "var(--status-warning)", icon: Clock },
    [QUEUE_STATUSES.APPROVED]: { label: "APPROVED", color: "var(--status-success)", icon: CheckCircle2 },
    [QUEUE_STATUSES.REJECTED]: { label: "REJECTED", color: "var(--status-error)", icon: XCircle },
  };

  const c = config[status] || config[QUEUE_STATUSES.PENDING];
  const Icon = c.icon;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        ...mono,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        padding: "2px 8px",
        borderRadius: 2,
        background: `color-mix(in srgb, ${c.color} 12%, transparent)`,
        color: c.color,
        flexShrink: 0,
      }}
    >
      <Icon size={10} />
      {c.label}
    </span>
  );
}

// ── Lineage badge (for use on record detail views) ──────────────────────────

/**
 * Small inline badge showing source-file lineage on imported records.
 * Mount this on Drawing/RFI/Document detail panels when `import_metadata`
 * is present on the record.
 *
 * @param {object} props
 * @param {object} props.metadata  The `import_metadata` JSONB from the record
 */
export function ImportLineageBadge({ metadata }) {
  if (!metadata || typeof metadata !== "object") return null;

  const fileName = metadata.source_file_name;
  const confidence = metadata.extraction_confidence;

  if (!fileName) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 2,
        border: `1px solid color-mix(in srgb, ${AI} 30%, var(--border-default))`,
        background: `color-mix(in srgb, ${AI} 6%, transparent)`,
      }}
    >
      <FileText size={11} color={AI} />
      <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
        Imported from:
      </span>
      <span style={{ ...mono, fontSize: 10, fontWeight: 600, color: "var(--text-primary)" }}>
        {fileName}
      </span>
      {confidence != null && (
        <ConfidencePill value={confidence} />
      )}
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const btnSmall = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "5px 12px",
  borderRadius: 2,
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
};

function btnAction(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 2,
    border: `1px solid ${color}`,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    color,
    cursor: "pointer",
    padding: 0,
  };
}
