import { useRef, useState, useMemo, useCallback } from "react";
import { useProjectContext } from "../components/shared/ProjectContext";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { BulkActionBar } from "@/components/design-system";
import DeleteDialog from "../components/shared/DeleteDialog";
import SOVFormModal from "../components/sov/SOVFormModal";
import { getNextNumber } from "../components/shared/numberSequencing";
import { toast } from "sonner";
import { usePermissions } from "@/services/permissions";
import SovImportReviewModal from "../components/sov/SovImportReviewModal";
import {
  parseCsvToAoa,
  aoaToRows,
  buildSovStaged,
} from "../lib/importSovSpreadsheet";
import SovControlCenter from "./sov/SovControlCenter";
import { downloadTextFile } from "@/lib/exports/fabRelease";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button as DsButton } from "@/components/design-system";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { SovNoProjectGuard } from "./sov/components";
import {
  buildSovCsvRows, buildSovCsvString,
  calcSovLine,
} from "./sov/format";
import {
  resolveEffectiveRetainage,
  filterSovLines,
  filterSovLinesForControlCenter,
} from "./sov/sovPageHelpers";

export default function SOV() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const { can } = usePermissions();

  const [appFilter, setAppFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ccSearch, setCcSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [stagedImport, setStagedImport] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const fileInputRef = useRef(null);

  const [globalRetainage, setGlobalRetainage] = useState("per-row");
  const [customRetainage, setCustomRetainage] = useState("");

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.CostCode.filter({ project_id: activeProject.id }, "cost_code_number")
      : [],
    enabled: !!activeProject?.id,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: sovs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["sov-items", activeProject?.id],
    queryFn: () => activeProject?.id
      ? entities.SOVItem.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: async (d) => {
      if (!activeProject?.id) {
        throw new Error("Select a project before creating a SOV item.");
      }
      let sovId;
      try {
        sovId = await getNextNumber(activeProject.id, "SOV");
      } catch (e) {
        console.warn("[SOV] getNextNumber failed:", e?.message);
        throw new Error("Unable to reserve a SOV id. Please retry.");
      }
      if (!sovId) throw new Error("Unable to reserve a SOV id. Please retry.");
      return entities.SOVItem.create({
        ...d,
        sov_id: sovId,
        project_id: d.project_id || activeProject?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("SOV item created");
    },
    onError: (err) => {
      toast.error("Failed to create SOV item: " + (err?.message || "Check that a project is selected and try again."));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.SOVItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("SOV item updated");
    },
    onError: (err) => {
      toast.error("Failed to update SOV item: " + (err?.message || "Unknown error"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.SOVItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setDeleteTarget(null);
      toast.success("SOV item deleted");
    },
    onError: () => {
      toast.error("Failed to delete SOV item");
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids) => entities.SOVItem.bulkDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success("Deleted selected SOV items");
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }) => entities.SOVItem.bulkUpdate(ids, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      toast.success("Status updated");
    },
    onError: () => toast.error("Bulk status update failed"),
  });

  const bulkFillMut = useMutation({
    mutationFn: (ids) => entities.SOVItem.bulkUpdate(ids, { current_percent_complete: 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sov-items"] });
      setSelectedIds(new Set());
      toast.success("Filled selected to 100%");
    },
    onError: () => toast.error("Bulk fill failed"),
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };


  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!activeProject?.id) {
      toast.error("Select a project before importing SOV items");
      return;
    }
    setImporting(true);
    try {
      const name = (file.name || "").toLowerCase();
      let rows;
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = aoaToRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
      } else {
        rows = aoaToRows(parseCsvToAoa(await file.text()));
      }
      if (rows.length === 0) {
        toast.error("File is empty — nothing to import");
        return;
      }
      const first = rows[0];
      if (!("description" in first) || !("scheduled_value" in first)) {
        toast.error("File missing required columns (description, scheduled_value). Download the template for the correct format.");
        return;
      }
      const staged = buildSovStaged(rows, {
        project: activeProject,
        existingCount: sovs.length || 0,
        costCodes,
      });
      if (!staged.some((s) => s.valid)) {
        toast.error("No valid rows — each row needs a description and scheduled_value > 0");
        return;
      }
      setStagedImport(staged);
      setReviewOpen(true);
    } catch (err) {
      console.error("SOV import parse failed:", err);
      toast.error("Could not read file: " + (err?.message || "unknown error"));
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async (validRecords) => {
    if (!validRecords?.length) return;
    setImporting(true);
    try {
      await entities.SOVItem.bulkCreate(validRecords);
      await qc.invalidateQueries({ queryKey: ["sov-items"] });
      toast.success(`Imported ${validRecords.length} SOV line item${validRecords.length === 1 ? "" : "s"}`);
      setReviewOpen(false);
      setStagedImport([]);
    } catch (err) {
      console.error("SOV import failed:", err);
      toast.error("Import failed: " + (err?.message || "unknown error"));
    } finally {
      setImporting(false);
    }
  };

  const effectiveRetainage = useMemo(
    () => resolveEffectiveRetainage(globalRetainage, customRetainage),
    [globalRetainage, customRetainage],
  );

  const calc = useCallback(
    (s) => calcSovLine(s, effectiveRetainage),
    [effectiveRetainage],
  );

  const filtered = useMemo(
    () => filterSovLines(sovs, { appFilter, statusFilter }),
    [sovs, appFilter, statusFilter],
  );

  const ccFiltered = useMemo(
    () => filterSovLinesForControlCenter(sovs, { statusFilter, ccSearch }),
    [sovs, statusFilter, ccSearch],
  );

  const exportCSV = () => {
    const csv = buildSovCsvString(buildSovCsvRows(filtered, calc));
    downloadTextFile(csv, "sov.csv", "text/csv;charset=utf-8");
  };

  const nextSovId = "";

  if (!activeProject?.id) return <SovNoProjectGuard />;

  const modals = (
    <>
      <SOVFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        sov={editing}
        projects={projects}
        nextId={nextSovId}
        activeProject={activeProject}
      />
      <SovImportReviewModal
        open={reviewOpen}
        onClose={() => { setReviewOpen(false); setStagedImport([]); }}
        staged={stagedImport}
        onConfirm={handleConfirmImport}
        importing={importing}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete SOV Item"
        description={`Delete ${deleteTarget?.sov_id}?`}
      />
      <DeleteDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title="Delete SOV Items"
        description={`Delete ${selectedIds.size} selected SOV item${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </>
  );

  // Gate fetch states at the page shell — SovControlCenter has no loading props
  // (same pattern as ActionItems / Procurement / Backcharges).
  if (isLoading) {
    return (
      <div className="sov-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sov-page" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load SOV items
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(error, "Something went wrong. Try again.")}
        </p>
        <DsButton variant="outline" onClick={() => refetch()}>Retry</DsButton>
      </div>
    );
  }

  return (
    <div className="sov-page">
      <ListTruncationNotice count={sovs.length} label="SOV line items" />
      <SovControlCenter
        projectName={activeProject?.name || "All Projects"}
        lines={sovs}
        filtered={ccFiltered}
        search={ccSearch}
        onSearch={setCcSearch}
        statusFilter={statusFilter === "all" ? "All" : statusFilter}
        onStatusFilter={(v) => setStatusFilter(v === "All" ? "all" : v)}
        effectiveRetainage={effectiveRetainage}
        onExport={exportCSV}
        onImport={can("create", "sov_item") ? handleImportClick : null}
        onCreate={can("create", "sov_item") ? () => { setEditing(null); setModalOpen(true); } : null}
        onOpenLine={(line) => { setEditing(line); setModalOpen(true); }}
        canCreate={can("create", "sov_item")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleImportFile}
        style={{ display: "none" }}
      />
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "Fill to 100%",
            icon: Check,
            onClick: () => bulkFillMut.mutate([...selectedIds]),
          },
          {
            label: "Mark Draft",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedIds], status: "Draft" }),
          },
          {
            label: "Mark Submitted",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedIds], status: "Submitted" }),
          },
          {
            label: "Delete Selected",
            icon: Trash2,
            variant: "danger",
            onClick: () => setBulkDeleteOpen(true),
          },
        ]}
      />
      {modals}
    </div>
  );
}
