/**
 * DocumentsControlCenter — canonical presentation for the Documents page.
 *
 * The parent Documents.jsx shell owns data, mutations, and modals. This
 * component owns the canonical catalog shell and accepts narrow workspace
 * slots so the existing DMS controls remain in the same route.
 *
 * Inline style notes for the coordinator (CSS wants):
 *   - .docs-cc wrapper: uses cmd-panels grid and cmd-table-wrap already in command.css
 *   - Size column cells: font-family IBM Plex Mono, text-align right
 *   - Category chip buttons: cmd-chip-btn pattern (already defined in command.css)
 *   - File-type badge: small colored pill, similar to cmd-badge but no tone map yet
 *     → using inline `style` background/color from LIST_FILETYPE_STYLES in utils.js
 */

import { type DragEventHandler, type ReactNode, useMemo } from "react";
import { FolderOpen, FileText, Clock, AlertCircle, HardDrive, Layers, FolderInput, Trash2, XCircle } from "lucide-react";
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
import { photoFor } from "@/config/launcherConfig";
import FolderBar from "./FolderBar";
import { buildDocumentsSummary, fmtSizeKb } from "./documentsControlCenter.derive";
import type { DocumentRecord, FolderRecord } from "./documentsControlCenter.derive";
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

  /* ── Folder browsing (document_folders) ── */
  folders: FolderRecord[];
  /** null = project root. */
  currentFolderId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentFolderId: string | null) => void;
  onRenameFolder: (folder: FolderRecord, name: string) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  onBulkDeleteFolders: (folderIds: string[]) => void;
  onBulkMoveFolders: (folderIds: string[]) => void;
  onOpenBulkCreateFolders: () => void;
  /** Move the currently-selected documents into a folder (opens the picker). */
  onMoveSelectedDocs: () => void;
  onDeleteSelectedDocs: () => void;
  onClearSelection: () => void;

  /** Existing DMS controls composed into the canonical shell. */
  documentControls?: ReactNode;
  statusTabs?: ReactNode;
  advancedFilters?: ReactNode;
  batchActions?: ReactNode;
  documentContent?: ReactNode;
  isDragOver?: boolean;
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
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
    folders, currentFolderId, onNavigateFolder,
    onCreateFolder, onRenameFolder, onDeleteFolder,
    onBulkDeleteFolders, onBulkMoveFolders, onOpenBulkCreateFolders,
    onMoveSelectedDocs, onDeleteSelectedDocs, onClearSelection,
    documentControls, statusTabs, advancedFilters, batchActions, documentContent,
    isDragOver, onDragEnter, onDragLeave, onDragOver, onDrop,
  } = props;

  useCommandSkin();
  const s = useMemo(() => buildDocumentsSummary(allDocuments), [allDocuments]);

  // While searching, the list spans every folder — so show where each hit
  // lives. Inside a folder the column would be a constant, so we hide it.
  const isSearching = search.trim().length > 0;
  const folderNameById = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders],
  );

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
    ...(isSearching
      ? ([{
          key: "folder",
          header: "Folder",
          render: (d: DocumentRecord) => (
            <span className="cmd-row__meta">
              {d.folder_id ? folderNameById.get(d.folder_id) ?? "—" : "All Documents"}
            </span>
          ),
        }] as Column<DocumentRecord>[])
      : []),
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
    <div
      className="docs-cc"
      style={{ position: "relative" }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2500,
            background: "rgba(200,155,32,0.08)",
            border: "3px dashed var(--accent)",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--accent)" }}>
            DROP FILES TO UPLOAD
          </span>
        </div>
      )}
      <PageHero
        Icon={FolderOpen}
        title="Documents Control Center"
        subtitle="Upload, organize, and track project documents — shop drawings, specs, and submittals in one place."
        projectName={projectName}
        chips={heroChips}
        photoSrc={photoFor("Documents") ?? undefined}
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

      {documentControls}

      {/* Folder browser. Hidden while searching, because search deliberately
          spans every folder and a breadcrumb would then be misleading. */}
      {!isSearching && (
        <div style={{ marginBottom: 12 }}>
          <FolderBar
            folders={folders}
            currentFolderId={currentFolderId}
            onNavigate={onNavigateFolder}
            onCreate={onCreateFolder}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
            onBulkDelete={onBulkDeleteFolders}
            onBulkMove={onBulkMoveFolders}
            onOpenBulkCreate={onOpenBulkCreateFolders}
          />
        </div>
      )}

      {statusTabs}
      {advancedFilters}
      {batchActions}
      {!batchActions && selectable && selectedIds!.size > 0 && (
        <div className="docs-cc__batch">
          <span className="docs-cc__batch-count">
            {selectedIds!.size} DOCUMENT{selectedIds!.size === 1 ? "" : "S"} SELECTED
          </span>
          <button type="button" className="cmd-chip-btn" onClick={onMoveSelectedDocs}>
            <FolderInput size={12} /> Move To…
          </button>
          <button type="button" className="cmd-chip-btn docs-cc__batch-danger" onClick={onDeleteSelectedDocs}>
            <Trash2 size={12} /> Delete
          </button>
          <button type="button" className="cmd-chip-btn" onClick={onClearSelection}>
            <XCircle size={12} /> Clear
          </button>
        </div>
      )}

      {documentContent ?? (
        <DataTable
          columns={columns}
          rows={filteredDocs}
          onRowClick={onOpenDoc}
          emptyMessage={
            isSearching
              ? "No documents match your search."
              : currentFolderId
                ? "This folder is empty."
                : "No documents match your filters."
          }
        />
      )}

      <style>{`
        .docs-cc__batch {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 8px 12px; margin-bottom: 12px;
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          border-radius: 2px;
        }
        .docs-cc__batch-count {
          font-family: var(--font-mono); font-size: 11px; font-weight: 700;
          letter-spacing: 0.06em; color: var(--accent); margin-right: 4px;
        }
        .docs-cc__batch .cmd-chip-btn {
          display: inline-flex; align-items: center; gap: 6px;
        }
        .docs-cc__batch-danger { color: var(--status-error); }
      `}</style>
    </div>
  );
}
