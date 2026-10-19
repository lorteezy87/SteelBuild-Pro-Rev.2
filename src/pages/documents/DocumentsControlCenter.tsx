/**
 * DocumentsControlCenter — the Documents page as a two-pane file browser.
 *
 *   ┌ Documents   [Search in this project]  [Add filter ▾]       [+ New ▾] ┐
 *   ├──────────────┬────────────────────────────────────────────────────────┤
 *   │ ▾ Project     │  Current folder                                        │
 *   │   ▸ Folder A  │  ☐ Name ↑                 Status  Size  Created on     │
 *   │     Folder B  │  ☐ 📁 Folder A                         03/14/26 at …  │
 *   │ ────────────  │  ☐ 📄 Drawing.pdf          Draft  1 MB  03/14/26 at …  │
 *   │ New this week │                                                        │
 *   │ Needs review  │                                                        │
 *   │ Recycle bin   │                                                        │
 *   └──────────────┴────────────────────────────────────────────────────────┘
 *
 * The tree and the table show whatever folders the project has created in
 * `document_folders`. The parent Documents.jsx owns data, mutations and
 * modals; this component owns presentation and local UI state (expanded
 * tree nodes, sort, menus).
 */

import {
  type DragEventHandler,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown, ArrowUp, CalendarClock, ChevronDown, ChevronRight, Download, Eye, File, FileImage,
  FileSpreadsheet, FileText, Filter, Folder, FolderInput, FolderOpen, FolderPlus, FolderTree,
  MoreHorizontal, Pencil, Plus, RotateCcw, Search, Send, Trash2, Upload, X,
} from "lucide-react";
import "@/styles/command.css";
import "./documentsBrowser.css";
import { Pill, useCommandSkin } from "@/components/command";
import { buildFolderPath, fmtSizeKb } from "./documentsControlCenter.derive";
import type { DocumentRecord, FolderRecord } from "./documentsControlCenter.derive";
import {
  ancestorIds, childFolders, directDocCounts, formatCreatedOn, indexFolderChildren, isNeedsReview,
  quickViewDocs, searchFolders, sortDocuments, sortFolders,
} from "./documentsBrowser.derive";
import type { QuickView, SortDir, SortKey } from "./documentsBrowser.derive";

// ---------------------------------------------------------------------------

type FilterKey = "status" | "category" | "discipline";
type ActiveFilters = Partial<Record<FilterKey, string[] | null>>;

const FILTER_OPTIONS: Record<FilterKey, { label: string; values: string[] }> = {
  status: {
    label: "Status",
    values: ["Draft", "Under Review", "Approved", "Approved with Comments", "Revise & Resubmit", "Rejected", "Issued", "Superseded", "Archived", "Void"],
  },
  category: {
    label: "Category",
    values: ["Blueprint", "Shop Drawing", "IFC Model", "Specification", "Submittal", "Transmittal", "RFI Response", "Change Order", "Contract", "Photo", "Report", "Correspondence", "Permit", "Inspection Report", "Other", "Uncategorized"],
  },
  discipline: {
    label: "Discipline",
    values: ["Structural", "Architectural", "MEP", "Civil", "Misc Metals", "Geotechnical", "General", "Other"],
  },
};

function statusTone(status?: string | null): "good" | "warn" | "danger" | "neutral" | "info" {
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

function FileIcon({ type }: { type?: string | null }) {
  const t = String(type ?? "").toLowerCase();
  if (t === "pdf") return <FileText size={18} className="docb-icon docb-icon--pdf" aria-hidden />;
  if (["xls", "xlsx", "csv"].includes(t)) return <FileSpreadsheet size={18} className="docb-icon docb-icon--sheet" aria-hidden />;
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "tif", "tiff"].includes(t)) return <FileImage size={18} className="docb-icon docb-icon--image" aria-hidden />;
  return <File size={18} className="docb-icon" aria-hidden />;
}

type FolderWithDate = FolderRecord & { created_at?: string | null; created_by?: string | null };

// ---------------------------------------------------------------------------

export interface DocumentsControlCenterProps {
  projectName: string;
  allDocuments: DocumentRecord[];
  /**
   * The documents the table shows for the active view, already filtered by
   * the shell: the open folder (or every folder while searching), or the
   * quick view's project-wide set. Selection and export use the same list.
   */
  filteredDocs: DocumentRecord[];
  /** Active view. When omitted the component manages it locally. */
  view?: QuickView;
  onViewChange?: (view: QuickView) => void;
  search: string;
  onSearch: (v: string) => void;
  onOpenDoc: (doc: DocumentRecord) => void;
  onExport: () => void;
  onUpload: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;

  folders: FolderRecord[];
  currentFolderId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentFolderId: string | null) => void;
  onRenameFolder: (folder: FolderRecord, name: string) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  onBulkDeleteFolders: (folderIds: string[]) => void;
  onBulkMoveFolders: (folderIds: string[]) => void;
  onOpenBulkCreateFolders: () => void;
  onMoveSelectedDocs: () => void;
  onDeleteSelectedDocs: () => void;
  onClearSelection: () => void;

  /** Row actions on a single document. */
  onDownloadDoc?: (doc: DocumentRecord) => void;
  onEditDoc?: (doc: DocumentRecord) => void;
  onMoveDoc?: (doc: DocumentRecord) => void;
  onDeleteDoc?: (doc: DocumentRecord) => void;
  /** Build a transmittal from the selected documents. */
  onTransmittal?: () => void;

  /** "Add filter" state, shared with the shell's filterDocuments call. */
  activeFilters?: ActiveFilters;
  onFilterChange?: (key: FilterKey, values: string[] | null) => void;
  onClearFilters?: () => void;

  /** Load state of the documents read. A failed read is never shown as empty. */
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;

  /** Recycle bin: soft-deleted documents, read only when the view opens. */
  deletedDocs?: DocumentRecord[];
  deletedLoading?: boolean;
  deletedError?: string | null;
  onOpenRecycleBin?: () => void;
  onRestoreDoc?: (doc: DocumentRecord) => void;

  /** Bulk action bar from the shell (status, download, move, delete). */
  batchActions?: ReactNode;
  isDragOver?: boolean;
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;

  /** @deprecated retained for callers of the previous layout; ignored. */
  documentControls?: ReactNode;
  /** @deprecated */ statusTabs?: ReactNode;
  /** @deprecated */ advancedFilters?: ReactNode;
  /** @deprecated */ documentContent?: ReactNode;
  /** @deprecated */ categoryFilter?: string;
  /** @deprecated */ onCategoryChange?: (v: string) => void;
  /** @deprecated */ onStatusTabChange?: (v: string) => void;
}

// ---------------------------------------------------------------------------

export default function DocumentsControlCenter(props: DocumentsControlCenterProps) {
  const {
    projectName, allDocuments, filteredDocs, search, onSearch, onOpenDoc, onExport, onUpload,
    view: viewProp, onViewChange,
    selectedIds, onToggleSelect, onToggleAll,
    folders, currentFolderId, onNavigateFolder, onCreateFolder, onRenameFolder, onDeleteFolder,
    onBulkDeleteFolders, onBulkMoveFolders, onOpenBulkCreateFolders,
    onDownloadDoc, onEditDoc, onMoveDoc, onDeleteDoc, onTransmittal,
    activeFilters = {}, onFilterChange, onClearFilters,
    isLoading = false, loadError = null, onRetry,
    deletedDocs = [], deletedLoading = false, deletedError = null, onOpenRecycleBin, onRestoreDoc,
    batchActions, isDragOver, onDragEnter, onDragLeave, onDragOver, onDrop,
  } = props;

  useCommandSkin();

  const [localView, setLocalView] = useState<QuickView>("folder");
  const controlled = viewProp !== undefined;
  const view: QuickView = controlled ? viewProp : localView;
  const setView = (v: QuickView) => {
    if (v === view) return;
    if (!controlled) setLocalView(v);
    onViewChange?.(v);
  };
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [rootOpen, setRootOpen] = useState(true);
  const [treeOpenMobile, setTreeOpenMobile] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set());

  const index = useMemo(() => indexFolderChildren(folders), [folders]);
  const counts = useMemo(() => directDocCounts(allDocuments), [allDocuments]);
  const path = useMemo(() => buildFolderPath(folders, currentFolderId), [folders, currentFolderId]);
  const currentFolder = path[path.length - 1] ?? null;
  const isSearching = search.trim().length > 0;
  const recentCount = useMemo(() => quickViewDocs(allDocuments, "recent").length, [allDocuments]);
  const reviewCount = useMemo(() => allDocuments.filter(isNeedsReview).length, [allDocuments]);
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  // Keep the selected folder visible in the tree.
  useEffect(() => {
    const ancestors = ancestorIds(folders, currentFolderId);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      if (ancestors.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      return next;
    });
  }, [folders, currentFolderId]);

  // Folder selection only makes sense inside one folder.
  useEffect(() => { setSelectedFolderIds(new Set()); setCreatingFolder(false); }, [currentFolderId, view]);

  // Close open menus on outside click / Escape.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newMenuOpen && !filterMenuOpen && !rowMenu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-docb-menu]")) return;
      setNewMenuOpen(false); setFilterMenuOpen(false); setRowMenu(null);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { setNewMenuOpen(false); setFilterMenuOpen(false); setRowMenu(null); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [newMenuOpen, filterMenuOpen, rowMenu]);

  // ── Rows for the table ──────────────────────────────────────────────────
  const folderRows: FolderWithDate[] = useMemo(() => {
    if (view !== "folder") return [];
    const list = isSearching ? searchFolders(folders, search) : childFolders(index, currentFolderId);
    return sortFolders(list, sortKey, sortDir) as FolderWithDate[];
  }, [view, isSearching, folders, search, index, currentFolderId, sortKey, sortDir]);

  const docRows: DocumentRecord[] = useMemo(() => {
    // Controlled: the shell has already derived (and filtered) the rows for
    // the active view, so the table, selection and export see one list.
    if (controlled) return sortDocuments(filteredDocs, sortKey, sortDir);
    if (view === "recycle") return sortDocuments(deletedDocs, sortKey, sortDir);
    if (view === "recent" || view === "review") return sortDocuments(quickViewDocs(allDocuments, view), sortKey, sortDir);
    return sortDocuments(filteredDocs, sortKey, sortDir);
  }, [controlled, view, deletedDocs, allDocuments, filteredDocs, sortKey, sortDir]);

  const showLocation = isSearching || view !== "folder";
  const selectable = view !== "recycle" && !!(selectedIds && onToggleSelect && onToggleAll);
  const docSelectedCount = selectable ? docRows.filter((d) => selectedIds!.has(String(d.id))).length : 0;
  const allDocsSelected = selectable && docRows.length > 0 && docSelectedCount === docRows.length;

  const heading =
    view === "recent" ? "New this week"
      : view === "review" ? "Needs review"
        : view === "recycle" ? "Recycle bin"
          : isSearching ? `Search results for “${search.trim()}”`
            : currentFolder?.name ?? projectName ?? "Documents";

  const filterChips = (Object.keys(FILTER_OPTIONS) as FilterKey[]).flatMap((key) =>
    (activeFilters[key] ?? []).map((value) => ({ key, value })),
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "created" ? "desc" : "asc"); }
  };

  const openFolder = (id: string | null) => {
    setView("folder");
    if (isSearching) onSearch("");
    onNavigateFolder(id);
    setTreeOpenMobile(false);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openQuickView = (v: QuickView) => {
    setView(v);
    setTreeOpenMobile(false);
    if (v === "recycle") onOpenRecycleBin?.();
  };

  const submitNewFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    onCreateFolder(name, currentFolderId);
    setNewFolderName("");
    setCreatingFolder(false);
    if (currentFolderId) setExpanded((prev) => new Set(prev).add(currentFolderId));
  };

  const renameFolder = (folder: FolderRecord) => {
    setRowMenu(null);
    const next = window.prompt(`Rename folder "${folder.name}":`, folder.name || "");
    const trimmed = next?.trim();
    if (trimmed && trimmed !== folder.name) onRenameFolder(folder, trimmed);
  };

  const deleteFolder = (folder: FolderRecord) => {
    setRowMenu(null);
    const docs = counts.get(folder.id) ?? 0;
    const subs = childFolders(index, folder.id).length;
    const contents = docs + subs > 0 ? ` Its ${docs} document${docs === 1 ? "" : "s"} and ${subs} sub-folder${subs === 1 ? "" : "s"} move up one level.` : "";
    if (window.confirm(`Delete folder "${folder.name}"?${contents}`)) {
      onDeleteFolder(folder);
      if (currentFolderId === folder.id) onNavigateFolder(folder.parent_folder_id ?? null);
    }
  };

  const toggleFolderSelect = (id: string) =>
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allRowsSelected = allDocsSelected && (folderRows.length === 0 || selectedFolderIds.size === folderRows.length);
  const toggleAllRows = (checked: boolean) => {
    onToggleAll?.(checked);
    setSelectedFolderIds(checked ? new Set(folderRows.map((f) => f.id)) : new Set());
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, run: () => void) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); }
  };

  // ── Tree ────────────────────────────────────────────────────────────────
  const renderTree = (parentId: string | null, depth: number): ReactNode => {
    const kids = childFolders(index, parentId);
    if (kids.length === 0) return null;
    return (
      <ul role="group" className="docb-tree__group">
        {kids.map((f) => {
          const hasKids = childFolders(index, f.id).length > 0;
          const open = expanded.has(f.id);
          const active = view === "folder" && !isSearching && currentFolderId === f.id;
          return (
            <li key={f.id} role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={active}>
              <div className={`docb-tree__row${active ? " is-active" : ""}`} style={{ paddingLeft: 8 + depth * 18 }}>
                {hasKids ? (
                  <button type="button" className="docb-tree__twisty" onClick={() => toggleExpand(f.id)} aria-label={`${open ? "Collapse" : "Expand"} ${f.name}`}>
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                ) : <span className="docb-tree__twisty" aria-hidden />}
                <button type="button" className="docb-tree__label" onClick={() => openFolder(f.id)} title={f.name}>
                  {active ? <FolderOpen size={16} aria-hidden /> : <Folder size={16} aria-hidden />}
                  <span>{f.name}</span>
                </button>
              </div>
              {hasKids && open && renderTree(f.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const rootActive = view === "folder" && !isSearching && currentFolderId === null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={shellRef}
      className="docb"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="docb-drop" aria-hidden>
          <span>Drop files to upload to {currentFolder?.name ?? projectName}</span>
        </div>
      )}

      {/* ── Header ── */}
      <header className="docb-head">
        <h1 className="docb-head__title">Documents</h1>
        <label className="docb-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="Search in this project"
            aria-label="Search in this project"
            value={search}
            onChange={(e) => { onSearch(e.target.value); if (view !== "folder") setView("folder"); }}
          />
          {search && (
            <button type="button" className="docb-icon-btn" onClick={() => onSearch("")} aria-label="Clear search"><X size={14} /></button>
          )}
        </label>
        {onFilterChange && (
          <div className="docb-menu-wrap" data-docb-menu>
            <button type="button" className="cmd-btn" aria-haspopup="menu" aria-expanded={filterMenuOpen} onClick={() => setFilterMenuOpen((o) => !o)}>
              <Filter size={14} /> Add filter <ChevronDown size={13} />
            </button>
            {filterMenuOpen && (
              <div className="docb-menu docb-menu--filters" role="menu">
                {(Object.keys(FILTER_OPTIONS) as FilterKey[]).map((key) => (
                  <label key={key} className="docb-menu__field">
                    <span>{FILTER_OPTIONS[key].label}</span>
                    <select
                      className="sbd-select"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const cur = activeFilters[key] ?? [];
                        if (!cur.includes(v)) onFilterChange(key, [...cur, v]);
                        setFilterMenuOpen(false);
                      }}
                    >
                      <option value="">Add {FILTER_OPTIONS[key].label.toLowerCase()}…</option>
                      {FILTER_OPTIONS[key].values.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="docb-head__spacer" />
        <button type="button" className="cmd-btn cmd-btn--ghost docb-tree-toggle" onClick={() => setTreeOpenMobile((o) => !o)} aria-expanded={treeOpenMobile}>
          <FolderTree size={14} /> Folders
        </button>
        <div className="docb-menu-wrap" data-docb-menu>
          <button type="button" className="cmd-btn cmd-btn--primary" aria-haspopup="menu" aria-expanded={newMenuOpen} onClick={() => setNewMenuOpen((o) => !o)}>
            <Plus size={15} /> New <ChevronDown size={13} />
          </button>
          {newMenuOpen && (
            <div className="docb-menu docb-menu--right" role="menu">
              <button type="button" role="menuitem" onClick={() => { setNewMenuOpen(false); onUpload(); }}><Upload size={14} /> Upload files</button>
              <button type="button" role="menuitem" onClick={() => { setNewMenuOpen(false); setView("folder"); if (isSearching) onSearch(""); setCreatingFolder(true); }}><FolderPlus size={14} /> Folder</button>
              <button type="button" role="menuitem" onClick={() => { setNewMenuOpen(false); onOpenBulkCreateFolders(); }}><FolderTree size={14} /> Folder structure (bulk)</button>
              {onTransmittal && (
                <button type="button" role="menuitem" disabled={(selectedIds?.size ?? 0) === 0} onClick={() => { setNewMenuOpen(false); onTransmittal(); }} title={(selectedIds?.size ?? 0) === 0 ? "Select documents first" : undefined}>
                  <Send size={14} /> Transmittal from selection
                </button>
              )}
              <div className="docb-menu__sep" />
              <button type="button" role="menuitem" onClick={() => { setNewMenuOpen(false); onExport(); }}><Download size={14} /> Export list (CSV)</button>
            </div>
          )}
        </div>
      </header>

      {filterChips.length > 0 && (
        <div className="docb-chips" aria-label="Active filters">
          {filterChips.map(({ key, value }) => (
            <span key={`${key}:${value}`} className="docb-chip">
              {FILTER_OPTIONS[key].label}: {value}
              <button
                type="button"
                aria-label={`Remove ${FILTER_OPTIONS[key].label} ${value}`}
                onClick={() => {
                  const next = (activeFilters[key] ?? []).filter((v) => v !== value);
                  onFilterChange?.(key, next.length ? next : null);
                }}
              ><X size={12} /></button>
            </span>
          ))}
          {onClearFilters && <button type="button" className="docb-link" onClick={onClearFilters}>Clear all</button>}
        </div>
      )}

      <div className="docb-body">
        {/* ── Folder tree ── */}
        <nav className={`docb-tree${treeOpenMobile ? " is-open" : ""}`} aria-label="Folders">
          <ul role="tree" className="docb-tree__root">
            <li role="treeitem" aria-expanded={rootOpen} aria-selected={rootActive}>
              <div className={`docb-tree__row docb-tree__row--root${rootActive ? " is-active" : ""}`}>
                <button type="button" className="docb-tree__twisty" onClick={() => setRootOpen((o) => !o)} aria-label={`${rootOpen ? "Collapse" : "Expand"} ${projectName}`}>
                  {rootOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <button type="button" className="docb-tree__label" onClick={() => openFolder(null)} title={projectName}>
                  <FolderOpen size={16} aria-hidden />
                  <span>{projectName || "Project"}</span>
                </button>
              </div>
              {rootOpen && renderTree(null, 1)}
            </li>
          </ul>
          {folders.length === 0 && (
            <p className="docb-tree__empty">No folders yet. Use <strong>New → Folder</strong> to add one.</p>
          )}
          <div className="docb-tree__views">
            <button type="button" className={view === "recent" ? "is-active" : ""} onClick={() => openQuickView("recent")}>
              <CalendarClock size={15} aria-hidden /> New documents this week <span className="docb-count">{recentCount}</span>
            </button>
            <button type="button" className={view === "review" ? "is-active" : ""} onClick={() => openQuickView("review")}>
              <Eye size={15} aria-hidden /> Needs review <span className="docb-count">{reviewCount}</span>
            </button>
            {onOpenRecycleBin && (
              <button type="button" className={view === "recycle" ? "is-active" : ""} onClick={() => openQuickView("recycle")}>
                <Trash2 size={15} aria-hidden /> Recycle bin
              </button>
            )}
          </div>
        </nav>

        {/* ── Contents ── */}
        <section className="docb-main" aria-label={heading}>
          <div className="docb-main__head">
            {view === "folder" && !isSearching && path.length > 0 && (
              <nav className="docb-crumbs" aria-label="Folder path">
                <button type="button" onClick={() => openFolder(null)}>{projectName || "Project"}</button>
                {path.slice(0, -1).map((f) => (
                  <span key={f.id}><ChevronRight size={12} aria-hidden /><button type="button" onClick={() => openFolder(f.id)}>{f.name}</button></span>
                ))}
              </nav>
            )}
            <h2>{heading}</h2>
          </div>

          {view !== "recycle" && batchActions}
          {selectedFolderIds.size > 0 && (
            <div className="docb-folderbar" role="region" aria-label="Selected folders">
              <span>{selectedFolderIds.size} folder{selectedFolderIds.size === 1 ? "" : "s"} selected</span>
              <button type="button" className="cmd-btn" onClick={() => onBulkMoveFolders([...selectedFolderIds])}><FolderInput size={13} /> Move</button>
              <button
                type="button"
                className="cmd-btn docb-danger"
                onClick={() => {
                  const n = selectedFolderIds.size;
                  if (window.confirm(`Delete ${n} folder${n === 1 ? "" : "s"}? Their contents move up one level.`)) {
                    onBulkDeleteFolders([...selectedFolderIds]);
                    setSelectedFolderIds(new Set());
                  }
                }}
              ><Trash2 size={13} /> Delete</button>
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => setSelectedFolderIds(new Set())}>Clear</button>
            </div>
          )}

          <div className="docb-table-wrap">
            <table className="docb-table">
              <thead>
                <tr>
                  <th className="docb-col-check">
                    {selectable && (
                      <input
                        type="checkbox"
                        className="cmd-check"
                        aria-label="Select all"
                        checked={allRowsSelected}
                        onChange={(e) => toggleAllRows(e.target.checked)}
                      />
                    )}
                  </th>
                  <SortHeader label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  {showLocation && <th className="docb-col-loc">Folder</th>}
                  <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="docb-col-status" />
                  <SortHeader label="Size" k="size" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="docb-col-size" />
                  <SortHeader label={view === "recycle" ? "Created on" : "Created on / latest version"} k="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="docb-col-date" />
                  <th className="docb-col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {creatingFolder && view === "folder" && (
                  <tr className="docb-row docb-row--new">
                    <td className="docb-col-check" />
                    <td colSpan={showLocation ? 6 : 5}>
                      <div className="docb-newfolder">
                        <Folder size={18} className="docb-icon docb-icon--folder" aria-hidden />
                        <input
                          autoFocus
                          aria-label="New folder name"
                          placeholder="Folder name"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitNewFolder();
                            if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                          }}
                        />
                        <button type="button" className="cmd-btn cmd-btn--primary" onClick={submitNewFolder} disabled={!newFolderName.trim()}>Create</button>
                        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}

                {folderRows.map((f) => (
                  <tr
                    key={`f-${f.id}`}
                    className="docb-row docb-row--folder"
                    tabIndex={0}
                    onClick={() => openFolder(f.id)}
                    onKeyDown={(e) => onRowKey(e, () => openFolder(f.id))}
                  >
                    <td className="docb-col-check" onClick={(e) => e.stopPropagation()}>
                      {selectable && !isSearching && (
                        <input type="checkbox" className="cmd-check" aria-label={`Select folder ${f.name}`} checked={selectedFolderIds.has(f.id)} onChange={() => toggleFolderSelect(f.id)} />
                      )}
                    </td>
                    <td className="docb-col-name">
                      <span className="docb-namecell">
                        <Folder size={20} className="docb-icon docb-icon--folder" aria-hidden />
                        <span className="docb-namestack">
                          <span className="docb-nameline">
                            <span className="docb-name">{f.name}</span>
                            {(() => {
                              const n = (counts.get(f.id) ?? 0) + childFolders(index, f.id).length;
                              return n > 0 ? <span className="docb-count docb-count--inline" title={`${n} item${n === 1 ? "" : "s"}`}>{n}</span> : null;
                            })()}
                          </span>
                          <span className="docb-mobile-meta" aria-hidden>{formatCreatedOn(f.created_at)}</span>
                        </span>
                      </span>
                    </td>
                    {showLocation && <td className="docb-col-loc">{f.parent_folder_id ? folderNameById.get(f.parent_folder_id) ?? "—" : projectName}</td>}
                    <td className="docb-col-status" />
                    <td className="docb-col-size" />
                    <td className="docb-col-date">{formatCreatedOn(f.created_at)}</td>
                    <td className="docb-col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowMenu id={`f-${f.id}`} open={rowMenu === `f-${f.id}`} onToggle={setRowMenu} label={`Folder actions for ${f.name}`}>
                        <button type="button" role="menuitem" onClick={() => renameFolder(f)}><Pencil size={14} /> Rename</button>
                        <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onBulkMoveFolders([f.id]); }}><FolderInput size={14} /> Move</button>
                        <button type="button" role="menuitem" className="docb-danger" onClick={() => deleteFolder(f)}><Trash2 size={14} /> Delete</button>
                      </RowMenu>
                    </td>
                  </tr>
                ))}

                {docRows.map((d) => {
                  const id = String(d.id ?? "");
                  const name = d.displayName || d.documentNumber || "Untitled";
                  const created = (d.uploadedDate ?? d.created_at) as string | null | undefined;
                  const by = d.uploadedBy ? ` by ${d.uploadedBy}` : "";
                  const revision = d.revisionNumber && String(d.revisionNumber) !== "0" ? `Rev ${d.revisionNumber}` : null;
                  const recycled = view === "recycle";
                  return (
                    <tr
                      key={`d-${id}`}
                      className={`docb-row${selectable && selectedIds!.has(id) ? " is-selected" : ""}`}
                      tabIndex={0}
                      onClick={() => { if (!recycled) onOpenDoc(d); }}
                      onKeyDown={(e) => onRowKey(e, () => { if (!recycled) onOpenDoc(d); })}
                    >
                      <td className="docb-col-check" onClick={(e) => e.stopPropagation()}>
                        {selectable && (
                          <input type="checkbox" className="cmd-check" aria-label={`Select ${name}`} checked={selectedIds!.has(id)} onChange={() => onToggleSelect!(id)} />
                        )}
                      </td>
                      <td className="docb-col-name">
                        <span className="docb-namecell">
                          <FileIcon type={d.fileType as string | null} />
                          <span className="docb-namestack">
                            <span className="docb-nameline">
                              <span className="docb-name">{name}</span>
                              {revision && <span className="docb-rev">{revision}</span>}
                            </span>
                            {/* Phone width hides the Status/Size/Date columns; the same facts sit here. */}
                            <span className="docb-mobile-meta" aria-hidden>
                              {d.status ? <Pill tone={statusTone(d.status)}>{d.status}</Pill> : null}
                              {formatCreatedOn(created)}
                            </span>
                          </span>
                        </span>
                      </td>
                      {showLocation && (
                        <td className="docb-col-loc">{d.folder_id ? folderNameById.get(d.folder_id) ?? "—" : projectName}</td>
                      )}
                      <td className="docb-col-status">{d.status ? <Pill tone={statusTone(d.status)}>{d.status}</Pill> : null}</td>
                      <td className="docb-col-size">{d.fileSizeKb ? fmtSizeKb(Number(d.fileSizeKb)) : "—"}</td>
                      <td className="docb-col-date">
                        {recycled
                          ? <>{formatCreatedOn(created)}<span className="docb-sub">Deleted {formatCreatedOn(d.deleted_at as string | null)}</span></>
                          : <>{formatCreatedOn(created)}{by}</>}
                      </td>
                      <td className="docb-col-actions" onClick={(e) => e.stopPropagation()}>
                        {recycled ? (
                          onRestoreDoc && <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => onRestoreDoc(d)}><RotateCcw size={13} /> Restore</button>
                        ) : (
                          <RowMenu id={`d-${id}`} open={rowMenu === `d-${id}`} onToggle={setRowMenu} label={`Actions for ${name}`}>
                            <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onOpenDoc(d); }}><Eye size={14} /> Open</button>
                            {onDownloadDoc && <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onDownloadDoc(d); }}><Download size={14} /> Download</button>}
                            {onEditDoc && <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onEditDoc(d); }}><Pencil size={14} /> Edit details</button>}
                            {onMoveDoc && <button type="button" role="menuitem" onClick={() => { setRowMenu(null); onMoveDoc(d); }}><FolderInput size={14} /> Move</button>}
                            {onDeleteDoc && (
                              <button
                                type="button"
                                role="menuitem"
                                className="docb-danger"
                                onClick={() => { setRowMenu(null); if (window.confirm(`Delete "${name}"? It goes to the recycle bin.`)) onDeleteDoc(d); }}
                              ><Trash2 size={14} /> Delete</button>
                            )}
                          </RowMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(() => {
              const loading = view === "recycle" ? deletedLoading : isLoading;
              const error = view === "recycle" ? deletedError : loadError;
              if (loading) return <div className="docb-state" role="status">Loading documents…</div>;
              if (error) {
                return (
                  <div className="docb-state docb-state--error" role="alert">
                    <strong>Couldn’t load documents.</strong> {error}
                    {onRetry && view !== "recycle" && <button type="button" className="cmd-btn" onClick={onRetry}>Retry</button>}
                  </div>
                );
              }
              if (folderRows.length === 0 && docRows.length === 0 && !creatingFolder) {
                return (
                  <div className="docb-state">
                    {view === "recycle" ? "The recycle bin is empty."
                      : view === "recent" ? "No documents uploaded this week."
                        : view === "review" ? "No documents need review."
                          : isSearching || filterChips.length > 0 ? "No documents match your search or filters."
                            : (
                              <>
                                This folder is empty. Drop files here, or use{" "}
                                <button type="button" className="docb-link" onClick={onUpload}>Upload files</button>{" "}or{" "}
                                <button type="button" className="docb-link" onClick={() => setCreatingFolder(true)}>New folder</button>.
                              </>
                            )}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SortHeader({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`docb-sort${active ? " is-active" : ""}`} onClick={() => onSort(k)}>
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />) : null}
      </button>
    </th>
  );
}

function RowMenu({ id, open, onToggle, label, children }: {
  id: string; open: boolean; onToggle: (id: string | null) => void; label: string; children: ReactNode;
}) {
  return (
    <div className="docb-menu-wrap" data-docb-menu>
      <button type="button" className="docb-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => onToggle(open ? null : id)}>
        <MoreHorizontal size={16} />
      </button>
      {open && <div className="docb-menu docb-menu--right" role="menu">{children}</div>}
    </div>
  );
}
