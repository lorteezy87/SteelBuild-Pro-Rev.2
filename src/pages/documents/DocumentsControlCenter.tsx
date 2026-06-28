/**
 * DocumentsControlCenter — Command UI skin for the Documents page.
 *
 * Light-themed, behavior-preserving re-skin that mirrors the RfiControlCenter
 * pattern. All data, mutations, and modals are owned by the parent Documents.jsx
 * shell; this component is purely presentational.
 *
 * Inline style notes for the coordinator (CSS wants):
 *   - .docs-cc wrapper: uses cmd-panels grid and cmd-table-wrap already in command.css
 *   - Size column cells: font-family IBM Plex Mono, text-align right
 *   - Category chip buttons: cmd-chip-btn pattern (already defined in command.css)
 *   - File-type badge: small colored pill, similar to cmd-badge but no tone map yet
 *     → using inline `style` background/color from LIST_FILETYPE_STYLES in utils.js
 */

import { useMemo } from "react";
import { FolderOpen, FileText, Clock, AlertCircle, HardDrive, Layers } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildDocumentsSummary, fmtSizeKb } from "./documentsControlCenter.derive";
import type { DocumentRecord } from "./documentsControlCenter.derive";
import { LIST_FILETYPE_STYLES, FILETYPE_FALLBACK } from "./utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_CATEGORIES = ["All", "Structural", "Electrical", "Civil", "Mechanical", "Architectural", "General"];

function statusToneForDoc(status?: string | null): "good" | "warn" | "danger" | "neutral" | "info" {
  switch (status) {
    case "Approved":
    case "Approved with Comments":
    case "Issued":
      return "good";
    case "Under Review":
    case "Revise & Resubmit":
      return "warn";
    case "Rejected":
    case "Void":
      return "danger";
    case "Draft":
      return "info";
    default:
      return "neutral";
  }
}

function fileTypeBadge(fileType?: string | null) {
  const key = (fileType || "other").toLowerCase();
  const style = LIST_FILETYPE_STYLES[key as keyof typeof LIST_FILETYPE_STYLES] ?? FILETYPE_FALLBACK;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 3,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: style.bg,
        color: style.color,
      }}
    >
      {key === "other" ? "—" : key}
    </span>
  );
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function scrollToTable() {
  document.querySelector(".docs-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DocumentsControlCenterProps {
  projectName: string;
  /** All documents (non-filtered) from the Documents.jsx query. */
  allDocuments: DocumentRecord[];
  /** Filtered + sorted list, applying all active filters. */
  filteredDocs: DocumentRecord[];
  search: string;
  onSearch: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  onStatusTabChange: (v: string) => void;
  onOpenDoc: (doc: DocumentRecord) => void;
  onExport: () => void;
  /** Opens the upload modal; already wired in the parent. */
  onUpload: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentsControlCenter(props: DocumentsControlCenterProps) {
  const {
    projectName, allDocuments, filteredDocs, search, onSearch,
    categoryFilter, onCategoryChange, onStatusTabChange,
    onOpenDoc, onExport, onUpload,
    selectedIds, onToggleSelect, onToggleAll,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildDocumentsSummary(allDocuments), [allDocuments]);

  // Derive the list of unique categories from the real data so chips are dynamic.
  const liveCategories = useMemo(() => {
    const cats = new Set(allDocuments.map((d) => d.category || "Uncategorized"));
    return ["All", ...Array.from(cats).sort()];
  }, [allDocuments]);

  const heroChips = [
    { label: `${s.total} Total` },
    { label: `${s.recentCount} This Week`, tone: "good" as const },
    { label: `${s.needsReviewCount} Needs Review` },
  ];

  const kpiCells: KpiCellDef[] = [
    { label: "Total Files",     value: s.total,                      sublabel: "documents",   tone: "neutral",        Icon: FileText },
    { label: "Categories",      value: s.categories,                 sublabel: "types",       tone: "info",           Icon: Layers },
    { label: "Recent (7d)",     value: s.recentCount,                sublabel: "uploaded",    tone: "good",           Icon: Clock },
    { label: "Total Size",      value: fmtSizeKb(s.totalSizeKb),    sublabel: "stored",      tone: "neutral",        Icon: HardDrive },
    { label: "Needs Review",    value: s.needsReviewCount,           sublabel: "documents",   tone: s.reviewTone,     Icon: AlertCircle },
  ];

  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected = selectable && filteredDocs.length > 0 && selectedIds!.size === filteredDocs.length;

  const columns: Column<DocumentRecord>[] = [
    ...(selectable
      ? ([{
          key: "sel",
          header: (
            <input
              type="checkbox"
              className="cmd-check"
              checked={allSelected}
              onChange={(e) => onToggleAll!(e.target.checked)}
              aria-label="Select all documents"
            />
          ),
          render: (d: DocumentRecord) => (
            <input
              type="checkbox"
              className="cmd-check"
              checked={selectedIds!.has(d.id || "")}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect!(d.id || "")}
              aria-label="Select document"
            />
          ),
        }] as Column<DocumentRecord>[])
      : []),
    {
      key: "name",
      header: "Name",
      render: (d) => (
        <span style={{ fontWeight: 500 }}>
          {d.displayName || d.documentNumber || "Untitled"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (d) => fileTypeBadge(d.fileType),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      render: (d) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {d.fileSizeKb ? fmtSizeKb(Number(d.fileSizeKb)) : "—"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (d) => d.category || <span className="cmd-row__meta">Uncategorized</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (d) => (
        d.status
          ? <Pill tone={statusToneForDoc(d.status)}>{d.status}</Pill>
          : <span className="cmd-row__meta">—</span>
      ),
    },
    {
      key: "uploadedBy",
      header: "Uploaded By",
      render: (d) => d.uploadedBy || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (d) => (
        <span className="cmd-row__meta">
          {fmtDate(d.uploadedDate ?? d.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="docs-cc">
      <PageHero
        Icon={FolderOpen}
        title="Documents Control Center"
        subtitle="Upload, organize, and track project documents — shop drawings, specs, and submittals in one place."
        projectName={projectName}
        chips={heroChips}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel
          title="Recent Uploads"
          onViewAll={() => { onStatusTabChange("all"); scrollToTable(); }}
        >
          {s.recentUploads.map((d) => (
            <div
              className="cmd-row is-clickable"
              key={d.id}
              onClick={() => onOpenDoc(d)}
            >
              <div>
                <div className="cmd-row__num">
                  {d.documentNumber || d.displayName || "Untitled"}
                </div>
                <div className="cmd-row__meta">
                  {d.category || "Uncategorized"} · {fmtDate(d.uploadedDate ?? d.created_at)}
                </div>
              </div>
              {fileTypeBadge(d.fileType)}
            </div>
          ))}
          {s.recentUploads.length === 0 && (
            <div className="cmd-row__meta">No documents uploaded yet.</div>
          )}
        </DecisionPanel>

        <DecisionPanel
          title="By Category"
          onViewAll={scrollToTable}
        >
          {s.byCategory.map((row) => (
            <div
              className="cmd-row"
              key={row.category}
              style={{ cursor: "pointer" }}
              onClick={() => { onCategoryChange(row.category); scrollToTable(); }}
            >
              <div>
                <div className="cmd-row__num">{row.category}</div>
                <div className="cmd-row__meta">{fmtSizeKb(row.totalSizeKb)}</div>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--cmd-text-primary, #1a1a1a)",
                }}
              >
                {row.count}
              </span>
            </div>
          ))}
          {s.byCategory.length === 0 && (
            <div className="cmd-row__meta">No categories yet.</div>
          )}
        </DecisionPanel>

        <DecisionPanel
          title="Needs Review"
          onViewAll={() => { onStatusTabChange("Under Review"); scrollToTable(); }}
        >
          {s.reviewQueue.map((d) => (
            <div
              className="cmd-row is-clickable"
              key={d.id}
              onClick={() => onOpenDoc(d)}
            >
              <div>
                <div className="cmd-row__num">
                  {d.documentNumber || d.displayName || "Untitled"}
                </div>
                <div className="cmd-row__meta">
                  {d.uploadedBy ? `By ${d.uploadedBy}` : "Unknown uploader"}
                </div>
              </div>
              <Pill tone={statusToneForDoc(d.status)}>{d.status || "—"}</Pill>
            </div>
          ))}
          {s.reviewQueue.length === 0 && (
            <div className="cmd-row__meta">No documents need review.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search by name, document number, or description"
        onExport={onExport}
        primaryLabel="Upload"
        onPrimary={onUpload}
        filters={
          <>
            {liveCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cmd-chip-btn${categoryFilter === cat ? " is-active" : ""}`}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filteredDocs}
        onRowClick={onOpenDoc}
        emptyMessage="No documents match your filters."
      />
    </div>
  );
}
