/** Development-only fixture: the shipped Documents browser with synthetic folders and files, no backend. */
import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import DocumentsControlCenter from "@/pages/documents/DocumentsControlCenter";
import { filterDocuments } from "@/pages/documents/documentsControlCenter.derive";
import type { DocumentRecord, FolderRecord } from "@/pages/documents/documentsControlCenter.derive";
import "@/globals.css";

const at = (d: string) => `${d}T09:25:00`;
const initialFolders: (FolderRecord & { created_at?: string })[] = [
  { id: "f01", name: "01 Design Files", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f02", name: "02 Bid Packages", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f03", name: "03 Safety", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f04", name: "04 Subcontractor Files", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f05", name: "05 Internal Documents", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f06", name: "AISC - ASTM", parent_folder_id: null, created_at: at("2026-03-14") },
  { id: "f07", name: "AISC - AWS", parent_folder_id: null, created_at: at("2026-03-14") },
  { id: "f08", name: "IFC Drawings", parent_folder_id: null, created_at: at("2026-03-10") },
  { id: "f09", name: "SDS", parent_folder_id: null, created_at: at("2026-03-14") },
  { id: "f10", name: "Tool box talk topics", parent_folder_id: null, created_at: at("2026-03-14") },
  { id: "f01a", name: "Structural", parent_folder_id: "f01", created_at: at("2026-03-11") },
  { id: "f01b", name: "Architectural", parent_folder_id: "f01", created_at: at("2026-03-11") },
  { id: "f08a", name: "Rev 1", parent_folder_id: "f08", created_at: at("2026-04-02") },
];
const docs: DocumentRecord[] = [
  { id: "d1", displayName: "AISC Code of Standard Practice.pdf", fileType: "pdf", folder_id: null, uploadedBy: "Michael Mulsow", uploadedDate: "2026-03-14T05:03:00", status: "Issued", fileSizeKb: 4210 },
  { id: "d2", displayName: "Safety Color code.pdf", fileType: "pdf", folder_id: null, uploadedBy: "Michael Mulsow", uploadedDate: "2026-03-14T05:03:00", fileSizeKb: 312 },
  { id: "d3", displayName: "S-101 Foundation Plan.pdf", fileType: "pdf", folder_id: "f01a", uploadedBy: "Detailer", uploadedDate: "2026-03-15T07:00:00", status: "Under Review", fileSizeKb: 1880, revisionNumber: "2" },
  { id: "d4", displayName: "Bid tabulation.xlsx", fileType: "xlsx", folder_id: "f02", uploadedBy: "Estimating", uploadedDate: "2026-03-12T15:40:00", fileSizeKb: 96 },
];

function Preview() {
  const [folders, setFolders] = useState(initialFolders);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState("");
  const filtered = useMemo(
    () => filterDocuments({ docs, search, category: "All", statusTab: "all", currentFolderId, activeFilters: {} }),
    [search, currentFolderId],
  );
  return (
    <main aria-label="Main content" style={{ padding: 20, minWidth: 0, maxWidth: 1400, margin: "0 auto" }}>
      <output aria-label="Opened document" style={{ position: "absolute", left: -9999 }}>{opened}</output>
      <DocumentsControlCenter
        projectName="25-014 - Madison"
        allDocuments={docs}
        filteredDocs={filtered}
        search={search}
        onSearch={setSearch}
        onOpenDoc={(d) => setOpened(String(d.id))}
        onExport={() => setOpened("export")}
        onUpload={() => setOpened("upload")}
        selectedIds={selected}
        onToggleSelect={(id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
        onToggleAll={(c) => setSelected(c ? new Set(filtered.map((d) => String(d.id))) : new Set())}
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigateFolder={setCurrentFolderId}
        onCreateFolder={(name, parent) => setFolders((f) => [...f, { id: `n${f.length}`, name, parent_folder_id: parent, created_at: "2026-10-06T10:00:00" }])}
        onRenameFolder={() => {}}
        onDeleteFolder={() => {}}
        onBulkDeleteFolders={() => {}}
        onBulkMoveFolders={() => {}}
        onOpenBulkCreateFolders={() => {}}
        onMoveSelectedDocs={() => {}}
        onDeleteSelectedDocs={() => {}}
        onClearSelection={() => setSelected(new Set())}
        onDownloadDoc={() => {}}
        onFilterChange={() => {}}
        onOpenRecycleBin={() => {}}
      />
    </main>
  );
}

if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<ThemeProvider><Preview /></ThemeProvider>);
}
