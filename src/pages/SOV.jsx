import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useOrg } from "@/components/shared/OrgContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { sovEvidenceKey, loadSovEvidence, assertSovEvidence } from "./sov/evidence";
import { prepareSovImport, commitSovImport, validateSovValues } from "./sov/importBatch";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { BulkActionBar } from "@/components/design-system";
import DeleteDialog from "../components/shared/DeleteDialog";
import SOVFormModal from "../components/sov/SOVFormModal";
import { toast } from "sonner";
import { usePermissions } from "@/services/permissions";
import SovImportReviewModal from "../components/sov/SovImportReviewModal";
import {
  parseCsvToAoa,
  aoaToRows,
  buildSovStaged,
} from "../lib/importSovSpreadsheet";
import SovControlCenter from "./sov/SovControlCenter";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button as DsButton } from "@/components/design-system";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import { SovNoProjectGuard } from "./sov/components";
import {
  buildSovCsvRows,
  calcSovLine,
  SOV_CSV_HEADERS,
} from "./sov/format";
import { readFileText } from "@/lib/textDecoding";
import { getActiveOrgGeneration } from "@/lib/activeOrg";
import { getNumberedCreateRecovery, retainNumberedCreateRecovery, clearNumberedCreateRecovery, completeNumberedCreateRecovery } from "@/lib/numberedCreateRecovery";

const RECOVERY_NAMESPACE = "sov-register";

/**
 * CSV branch of the SOV import. Decodes by byte-order mark / UTF-16 sniff,
 * never `file.text()` (UTF-8 only): a UTF-16 export read as UTF-8 carries
 * U+0000 into SOVItem.bulkCreate, which Postgres rejects (22P05). A UTF-32 or
 * binary file throws a TextDecodingError, which handleImportFile toasts.
 * The XLSX branch reads bytes with SheetJS and never comes through here.
 */
export async function readSovCsvRows(file) {
  return aoaToRows(parseCsvToAoa((await readFileText(file)).text));
}

export default function SOV() {
  const projectId = useProjectId();
  const { currentOrg, isLoadingOrgs } = useOrg();
  const orgId = currentOrg?.id;
  const orgGeneration = getActiveOrgGeneration();
  const scope = useMemo(() => ({ projectId, orgId, isLoadingOrgs, orgGeneration }), [projectId, orgId, isLoadingOrgs, orgGeneration]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);
  return <WorkspaceSov key={`${orgId}:${projectId}:${isLoadingOrgs}:${orgGeneration}`} {...scope} scope={scope} currentScope={currentScope} />;
}

function WorkspaceSov({ projectId, orgId, isLoadingOrgs, scope, currentScope }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const permissions = useRef(can);
  permissions.current = can;
  const [appFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ccSearch, setCcSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const currentEditor = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const currentDelete = useRef(null);
  const [importing, setImporting] = useState(false);
  const [review, setReview] = useState(null);
  const currentReview = useRef(null);
  const [stagedImport, setStagedImport] = useState([]);
  const [importReceipts, setImportReceipts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const fileInputRef = useRef(null);
  const pendingWrite = useRef(false);
  const [globalRetainage] = useState("per-row");
  const [customRetainage] = useState("");
  const evidence = useQuery({
    queryKey: sovEvidenceKey(projectId, orgId),
    queryFn: () => loadSovEvidence(projectId, orgId),
    enabled: !!projectId && !!orgId && !isLoadingOrgs,
  });
  const snapshot = evidence.data?.projectId === projectId && evidence.data?.orgId === orgId ? evidence.data : null;
  const sovs = snapshot?.lines || [];
  const costCodes = snapshot?.costCodes || [];
  const activeProject = snapshot?.project;
  const ready = !!snapshot && !evidence.isError && !evidence.isFetching;
  const isCurrent = () => currentScope.current === scope && scope.orgGeneration === getActiveOrgGeneration();
  useRealtimeInvalidation("sov_items", snapshot ? projectId : null, [["sov-items", projectId]]);
  useRealtimeInvalidation("cost_codes", snapshot ? projectId : null, [["sov-items", projectId]]);

  const assertWrite = (action, recordIds = [], targetProjectId = projectId) => {
    if (!isCurrent()) throw new Error("Workspace or project changed. Reopen this operation.");
    if (!permissions.current(action, "sov_item")) throw new Error("You do not have permission for this SOV action.");
    if (targetProjectId !== projectId) throw new Error("A SOV line cannot move to another project.");
    const complete = assertSovEvidence(qc, projectId, orgId);
    if (recordIds.some(id => !complete.lines.some(line => line.id === id))) throw new Error("This SOV line is no longer in the selected project.");
    return complete;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["sov-items", projectId] });
  const closeEditor = (draft) => {
    if (!isCurrent() || currentEditor.current !== draft) return;
    currentEditor.current = null; setEditor(null); setRecoveryDraft(null);
  };
  const openEditor = (record = null) => {
    try {
      assertWrite(record ? "edit" : "create", record ? [record.id] : []);
      const recovery = record ? null : getNumberedCreateRecovery(RECOVERY_NAMESPACE, projectId);
      const draft = { record, clientOperationId: recovery?.operation || crypto.randomUUID(), uncertainPayload: recovery?.payload || null };
      currentEditor.current = draft; setEditor(draft); setRecoveryDraft(recovery ? draft : null);
    } catch (error) { toast.error(toUserErrorMessage(error)); }
  };
  const closeDelete = (target) => {
    if (!isCurrent() || currentDelete.current !== target) return;
    currentDelete.current = null; setDeleteTarget(null);
  };
  const requestDelete = (draft) => {
    try {
      if (currentEditor.current !== draft) throw new Error("This editor is no longer open.");
      assertWrite("delete", [draft.record.id]);
      const target = { record: draft.record };
      currentDelete.current = target; setDeleteTarget(target); closeEditor(draft);
    } catch (error) { toast.error(toUserErrorMessage(error)); }
  };

  const saveMut = useMutation({
    mutationFn: async ({ draft, data = null, recover = false }) => {
      if (!draft || currentEditor.current !== draft || !isCurrent()) throw new Error("This is a previous SOV draft. Reopen it before saving.");
      if (pendingWrite.current) throw new Error("Wait for the current SOV operation to finish.");
      const id = draft.record?.id;
      if (draft.uncertainPayload && !recover) throw new Error("Recover the original uncertain save before changing this draft.");
      if (recover) {
        if (id || !draft.uncertainPayload) throw new Error("There is no uncertain create to recover.");
        data = draft.uncertainPayload;
      }
      if (!data) throw new Error("The SOV draft payload is missing. Reopen it before saving.");
      assertWrite(id ? "edit" : "create", id ? [id] : [], data.project_id || projectId);
      validateSovValues(data);
      const { project_id: _projectId, project_name: _projectName, sov_id: _sovId, line_item_number: _line, ...editable } = data;
      const createPayload = structuredClone({ ...editable, project_id: projectId });
      const reservation = id ? undefined : retainNumberedCreateRecovery(RECOVERY_NAMESPACE, projectId, draft.clientOperationId, createPayload, scope.orgGeneration);
      if (!id && reservation === undefined) throw new Error("This save is already resolved or another draft needs recovery. Close and reopen the editor.");
      pendingWrite.current = true;
      try {
        const result = id
          ? await entities.SOVItem.update(id, editable, { sovItemReview: { updatedAt: draft.record.updated_at ?? null } })
          : await entities.SOVItem.create(createPayload, { clientOperationId: draft.clientOperationId });
        if (!id) {
          if (!isCurrent() || currentEditor.current !== draft) {
            throw Object.assign(new Error("The save completed for the previous draft. Reopen its editor to recover the saved SOV line."), { outcomeUnknown: true });
          }
          completeNumberedCreateRecovery(RECOVERY_NAMESPACE, projectId, draft.clientOperationId, scope.orgGeneration);
        }
        void refresh();
        if (isCurrent()) { closeEditor(draft); toast.success(id ? "SOV item updated" : "SOV item created"); }
        return result;
      } catch (error) {
        if (!id && error?.outcomeUnknown) {
          draft.uncertainPayload = createPayload;
          if (isCurrent() && currentEditor.current === draft) setRecoveryDraft(draft);
        } else if (!id && !draft.uncertainPayload) clearNumberedCreateRecovery(RECOVERY_NAMESPACE, projectId, draft.clientOperationId, scope.orgGeneration, reservation);
        throw error;
      } finally { pendingWrite.current = false; }
    },
    onError: (error, { draft }) => { if (isCurrent() && currentEditor.current === draft) toast.error(toUserErrorMessage(error, "SOV save failed.")); },
  });
  const deleteMut = useMutation({
    mutationFn: async target => {
      if (!target || currentDelete.current !== target || !isCurrent()) throw new Error("This is a previous delete dialog. Reopen it before deleting.");
      if (pendingWrite.current) throw new Error("Wait for the current SOV operation to finish.");
      assertWrite("delete", [target.record.id]);
      pendingWrite.current = true;
      try {
        await entities.SOVItem.delete(target.record.id); void refresh();
        if (isCurrent()) toast.success("SOV item deleted");
      } finally { pendingWrite.current = false; }
    },
    onError: error => { if (isCurrent()) toast.error(toUserErrorMessage(error, "SOV deletion failed.")); },
  });
  const bulkMut = useMutation({
    mutationFn: async ({ ids, action, data, reviewedRows = [] }) => {
      if (pendingWrite.current) throw new Error("Wait for the current SOV operation to finish.");
      assertWrite(action === "delete" ? "delete" : "edit", ids);
      pendingWrite.current = true;
      try {
        if (action === "delete") await entities.SOVItem.bulkDelete(ids);
        else {
          if (reviewedRows.length !== ids.length || ids.some(id => !reviewedRows.some(row => row.id === id))) throw new Error("The selected SOV revisions are incomplete. Select the rows again.");
          const failed = [];
          for (const row of reviewedRows) {
            try {
              assertWrite("edit", [row.id]);
              await entities.SOVItem.update(row.id, data, { sovItemReview: { updatedAt: row.updatedAt } });
            } catch (error) { failed.push({ id: row.id, error }); }
          }
          void refresh();
          if (isCurrent()) {
            setSelectedIds(new Set(failed.map(row => row.id)));
            if (failed.length) toast.error(`${failed.length} SOV lines could not be updated. Refresh and review their current values.`);
            else toast.success("Selected SOV items updated");
          }
          return;
        }
        void refresh();
        if (isCurrent()) { setSelectedIds(new Set()); toast.success("Selected SOV items updated"); }
      } finally { pendingWrite.current = false; }
    },
    onError: error => { if (isCurrent()) toast.error(toUserErrorMessage(error, "SOV bulk operation failed.")); },
  });
  const bulkEdit = data => {
    const ids = [...selectedIds];
    // Capture what this rendered register showed; never substitute newer cache revisions.
    const reviewedRows = sovs.filter(row => selectedIds.has(row.id)).map(row => ({ id: row.id, updatedAt: row.updated_at ?? null }));
    bulkMut.mutate({ ids, action: "edit", data, reviewedRows });
  };

  const closeReview = captured => {
    if (!isCurrent() || currentReview.current !== captured) return;
    currentReview.current = null; setReview(null); setStagedImport([]); setImportReceipts([]);
  };
  const assertReview = captured => {
    if (!captured || currentReview.current !== captured) throw new Error("This import review is no longer open.");
    assertWrite("create");
  };
  const handleImportClick = () => { try { assertWrite("create"); fileInputRef.current?.click(); } catch (error) { toast.error(toUserErrorMessage(error)); } };
  const handleImportFile = async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const captured = { key: crypto.randomUUID(), rows: [] };
    try { assertWrite("create"); } catch (error) { toast.error(toUserErrorMessage(error)); return; }
    currentReview.current = captured; setImporting(true);
    try {
      const name = (file.name || "").toLowerCase();
      let rows;
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        assertReview(captured);
        const bytes = await file.arrayBuffer(); assertReview(captured);
        const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
        rows = aoaToRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: "" }));
      } else rows = await readSovCsvRows(file);
      assertReview(captured);
      if (!rows.length) throw new Error("File is empty — nothing to import.");
      if (!("description" in rows[0]) || !("scheduled_value" in rows[0])) throw new Error("File missing required columns (description, scheduled_value).");
      const staged = prepareSovImport(buildSovStaged(rows, { project: activeProject, existingCount: sovs.length, costCodes }), name);
      captured.rows = staged;
      setStagedImport(staged); setImportReceipts(staged.flatMap(row => row.importedRecord ? [row.importedRecord] : [])); setReview(captured);
    } catch (error) { if (isCurrent() && currentReview.current === captured) toast.error(toUserErrorMessage(error, "Could not read SOV file.")); }
    finally { if (isCurrent() && currentReview.current === captured) setImporting(false); }
  };
  const handleConfirmImport = async (captured, validRecords) => {
    try {
      assertReview(captured);
      if (pendingWrite.current) throw new Error("Wait for the current SOV operation to finish.");
      const rows = captured.rows.filter(row => row.valid && validRecords.includes(row.record));
      if (!rows.length || rows.length !== validRecords.length) throw new Error("The import selection has changed. Reopen the review.");
      pendingWrite.current = true; setImporting(true);
      try {
        const result = await commitSovImport({ rows, projectId, assertScope: () => assertReview(captured), create: (payload, options) => entities.SOVItem.create(payload, options) });
        // Refresh only the origin project, including a commit that finished after close.
        if (result.succeeded.length) void refresh();
        if (!isCurrent() || currentReview.current !== captured) return;
        const remaining = [...captured.rows.filter(row => !row.valid), ...result.failed];
        captured.rows = remaining; setStagedImport(remaining);
        setImportReceipts(previous => [...previous, ...result.succeeded.map(resultRow => resultRow.record)]);
        if (result.failed.length) toast.error(`${result.failed.length} SOV rows need retry. Saved rows will not be repeated.`);
        else toast.success(`Imported ${result.succeeded.length} SOV line items`);
      } finally {
        pendingWrite.current = false;
        if (isCurrent() && currentReview.current === captured) setImporting(false);
      }
    } catch (error) { if (isCurrent() && currentReview.current === captured) toast.error(toUserErrorMessage(error, "SOV import failed.")); }
  };

  const effectiveRetainage = useMemo(() => {
    if (globalRetainage === "per-row") return null;
    if (globalRetainage === "custom") return Number(customRetainage) || 0;
    return Number(globalRetainage);
  }, [globalRetainage, customRetainage]);

  const calc = useCallback(
    (s) => calcSovLine(s, effectiveRetainage),
    [effectiveRetainage],
  );

  const filtered = useMemo(() => sovs
    .filter(s => {
      const matchApp = appFilter === "all" || String(s.application_number) === String(appFilter);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchApp && matchStatus;
    })
    .sort((a, b) => {
      const aNum = Number(a.line_item_number);
      const bNum = Number(b.line_item_number);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
      return String(a.sov_id || "").localeCompare(String(b.sov_id || ""), undefined, { numeric: true });
    }),
  [sovs, appFilter, statusFilter]);

  const ccFiltered = useMemo(() => {
    const q = ccSearch.trim().toLowerCase();
    return sovs
      .filter(s => {
        const matchStatus = statusFilter === "all" || statusFilter === "All" || s.status === statusFilter;
        if (!matchStatus) return false;
        if (!q) return true;
        return (
          String(s.line_item_number || "").toLowerCase().includes(q) ||
          (s.sov_id || "").toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q) ||
          (s.phase || "").toLowerCase().includes(q) ||
          (s.cost_code || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aNum = Number(a.line_item_number);
        const bNum = Number(b.line_item_number);
        if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
        return String(a.sov_id || "").localeCompare(String(b.sov_id || ""), undefined, { numeric: true });
      });
  }, [sovs, statusFilter, ccSearch]);

  const exportCSV = () => {
    const rows = buildSovCsvRows(filtered, calc);
    const csv = [SOV_CSV_HEADERS, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    void presentGeneratedFile({ blob, filename: "sov.csv", title: "Schedule of values" });
  };

  if (isLoadingOrgs) return <LoadingSkeleton variant="table" rows={8} />;
  if (!orgId) return <p role="alert">Select a workspace to view its schedule of values.</p>;
  if (!projectId) return <SovNoProjectGuard />;

  const modals = <>
    {editor && <SOVFormModal key={editor.clientOperationId} open onClose={() => closeEditor(editor)}
      onSave={data => saveMut.mutateAsync({ draft: editor, data })}
      requiresRecovery={recoveryDraft === editor} onRecover={() => saveMut.mutateAsync({ draft: editor, recover: true })}
      onDelete={editor.record && can("delete", "sov_item") ? () => requestDelete(editor) : null}
      isSaving={saveMut.isPending} writesDisabled={!ready}
      sov={editor.record} initialValues={editor.uncertainPayload} projects={activeProject ? [activeProject] : []} nextId="" activeProject={activeProject} />}
    {review && <SovImportReviewModal key={review.key} open onClose={() => closeReview(review)} staged={stagedImport}
      onConfirm={records => handleConfirmImport(review, records)} importing={importing} receipts={importReceipts} writesDisabled={!ready} />}
    <DeleteDialog key={deleteTarget?.record.id || "no-delete"} open={!!deleteTarget}
      onClose={() => closeDelete(deleteTarget)} onConfirm={() => deleteMut.mutateAsync(deleteTarget)} busy={deleteMut.isPending}
      title="Delete SOV Item" description={`Delete ${deleteTarget?.record.sov_id || "this SOV line"}?`} />
    <DeleteDialog open={bulkDeleteOpen} onClose={() => { if (isCurrent()) setBulkDeleteOpen(false); }}
      onConfirm={() => bulkMut.mutateAsync({ ids: [...selectedIds], action: "delete" })} busy={bulkMut.isPending}
      title="Delete SOV Items" description={`Delete ${selectedIds.size} selected SOV items? This cannot be undone.`} />
  </>;
  if (evidence.isLoading) return <div className="sov-page" style={{ padding: 24 }}><LoadingSkeleton variant="table" rows={8} />{modals}</div>;
  if (evidence.isError || !snapshot) return <div className="sov-page" style={{ padding: 24 }}>
    <div role="alert"><p>Couldn’t load complete SOV evidence</p><p>{toUserErrorMessage(evidence.error, "Retry the project evidence before using financial totals.")}</p>
      <DsButton variant="outline" onClick={() => evidence.refetch()}>Retry</DsButton></div>{modals}</div>;

  return (
    <div className="sov-page">
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
        onImport={ready && can("create", "sov_item") ? handleImportClick : null}
        onCreate={ready && can("create", "sov_item") ? () => openEditor() : null}
        onOpenLine={line => openEditor(line)}
        canCreate={ready && can("create", "sov_item")}
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
            onClick: () => bulkEdit({ current_percent_complete: 100 }),
          },
          {
            label: "Mark Draft",
            onClick: () => bulkEdit({ status: "Draft" }),
          },
          {
            label: "Mark Submitted",
            onClick: () => bulkEdit({ status: "Submitted" }),
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
