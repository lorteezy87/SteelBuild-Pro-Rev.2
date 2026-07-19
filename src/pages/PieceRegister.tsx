import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileUp,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import PieceRelationshipManager from "@/components/pieceControl/PieceRelationshipManager";
import { PieceProductionControl } from "@/components/pieceControl/PieceProductionControl";
import { PieceLogisticsControl } from "@/components/pieceControl/PieceLogisticsControl";
import { PieceControlPilotReadiness } from "@/components/pieceControl/PieceControlPilotReadiness";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { PIECE_IMPORT_SOURCE_OPTIONS, readPieceImportFile } from "@/lib/pieceControl/importAdapters";
import type { ImportPayload, PieceImportSourceType } from "@/lib/pieceControl/reconciliation";
import {
  applyPieceImportBatch,
  approvePieceImportBatch,
  fetchPieceImportBatches,
  fetchPieceImportRows,
  fetchPieceRegister,
  stagePieceImportBatch,
} from "@/lib/pieceControl/repository";
import { pieceTons } from "@/lib/pieceControl/tonnage";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { filterPieceRegisterRows, type PieceRegisterFilters } from "./pieceRegister/filter";

const EMPTY_FILTERS: PieceRegisterFilters = {
  search: "",
  workPackageId: "",
  profile: "",
  grade: "",
  lifecycle: "",
  source: "",
  hold: "all",
};

const decisionTone: Record<string, string> = {
  new: "bg-emerald-50 text-emerald-800 border-emerald-200",
  unchanged: "bg-slate-50 text-slate-700 border-slate-200",
  update_candidate: "bg-amber-50 text-amber-900 border-amber-200",
  conflict: "bg-rose-50 text-rose-800 border-rose-200",
  invalid: "bg-red-50 text-red-800 border-red-200",
};

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function SelectFilter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800"
      >
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function PieceRegister() {
  const { activeProject } = useProjectContext() as any;
  const projectId = activeProject?.id as string | undefined;
  const mode = String(activeProject?.piece_control_mode ?? "off");
  const enabled = Boolean(projectId && mode !== "off");
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sourceType, setSourceType] = useState<PieceImportSourceType>("csv");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportPayload[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);

  const piecesQuery = useQuery({
    queryKey: ["piece-register", projectId],
    queryFn: () => fetchPieceRegister(projectId!),
    enabled,
    staleTime: 30_000,
  });
  const batchesQuery = useQuery({
    queryKey: ["piece-import-batches", projectId],
    queryFn: () => fetchPieceImportBatches(projectId!),
    enabled,
    staleTime: 10_000,
  });
  const workPackagesQuery = useQuery({
    queryKey: ["piece-register-work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled,
    staleTime: 30_000,
  });

  const batches = batchesQuery.data ?? [];
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null;
  const batchRowsQuery = useQuery({
    queryKey: ["piece-import-rows", projectId, selectedBatch?.id],
    queryFn: () => fetchPieceImportRows(projectId!, selectedBatch!.id),
    enabled: enabled && Boolean(selectedBatch?.id),
  });

  const workPackageMap = useMemo(
    () => new Map(
      (workPackagesQuery.data ?? []).map((wp: any) => [
        wp.id,
        wp.wp_number || wp.name || wp.title || "Unnamed package",
      ]),
    ),
    [workPackagesQuery.data],
  );
  const displayRows = useMemo(
    () => (piecesQuery.data ?? []).map((piece) => ({
      ...piece,
      workPackageLabel: piece.work_package_id
        ? workPackageMap.get(piece.work_package_id) ?? "Unknown package"
        : "Unassigned",
    })),
    [piecesQuery.data, workPackageMap],
  );
  const filteredRows = useMemo(
    () => filterPieceRegisterRows(displayRows, filters),
    [displayRows, filters],
  );

  const profiles = useMemo(() => uniqueValues(displayRows.map((row) => row.profile)), [displayRows]);
  const grades = useMemo(() => uniqueValues(displayRows.map((row) => row.material_grade)), [displayRows]);
  const lifecycles = useMemo(() => uniqueValues(displayRows.map((row) => row.lifecycle_status)), [displayRows]);
  const sources = useMemo(() => uniqueValues(displayRows.map((row) => row.source_system)), [displayRows]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-import-batches", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-import-rows", projectId] }),
    ]);
  };

  const stageMutation = useMutation({
    mutationFn: () => stagePieceImportBatch(
      projectId!,
      sourceType,
      importFile?.name ?? "browser import",
      importRows,
    ),
    onSuccess: async (summary) => {
      setSelectedBatchId(String(summary.batch_id));
      setImportFile(null);
      setImportRows([]);
      await invalidate();
      toast.success("Import staged for review");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to stage import"),
  });
  const approveMutation = useMutation({
    mutationFn: () => approvePieceImportBatch(selectedBatch!.id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Batch approved. Confirm once more to apply.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to approve batch"),
  });
  const applyMutation = useMutation({
    mutationFn: () => applyPieceImportBatch(selectedBatch!.id),
    onSuccess: async (summary) => {
      setApplyConfirmed(false);
      await invalidate();
      toast.success(`Import applied: ${summary.created ?? 0} created, ${summary.updated ?? 0} updated`);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to apply batch"),
  });

  const handleFile = async (file: File | null) => {
    setImportFile(file);
    setImportRows([]);
    if (!file) return;
    try {
      const rows = await readPieceImportFile(file);
      if (rows.length === 0) throw new Error("No import rows were found");
      setImportRows(rows);
    } catch (error) {
      setImportFile(null);
      toast.error(error instanceof Error ? error.message : "Unable to read import file");
    }
  };

  if (!projectId) {
    return (
      <div className="m-6 rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <Database className="mx-auto mb-4 h-10 w-10 text-slate-400" />
        <h1 className="text-2xl font-black text-slate-900">Select a project</h1>
        <p className="mt-2 text-slate-600">The Piece Register is always scoped to one project.</p>
      </div>
    );
  }

  if (mode === "off") {
    return (
      <div className="min-h-[70vh] bg-[radial-gradient(circle_at_top_left,_#fef3c7,_transparent_36%),linear-gradient(135deg,#f8fafc,#eef2f7)] p-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-amber-200 bg-white/90 p-10 shadow-sm">
          <ShieldCheck className="mb-5 h-11 w-11 text-amber-600" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Piece control disabled</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Piece Register is read-only and unavailable</h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Enable piece control for this project before staging imports or viewing canonical pieces.
            Existing release, production, dashboard, and model workflows are unchanged.
          </p>
          <div className="mt-8">
            <PieceControlPilotReadiness projectId={projectId} currentMode="off" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,_#fef3c7,_transparent_25%),linear-gradient(180deg,#f8fafc,#eef2f7)] p-4 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <header className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-300/40 md:px-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-400">Canonical scope control</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Piece Register</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Review root lots, physical metadata, provenance, and import exceptions without changing downstream workflows.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
                <div className="text-2xl font-black">{displayRows.length}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Active rows</div>
              </div>
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-3">
                <div className="text-2xl font-black text-amber-300">{mode.toUpperCase()}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Control mode</div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(220px,2fr)_repeat(6,minmax(120px,1fr))]">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Search
              <span className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Mark, package, profile..."
                  className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-slate-800"
                />
              </span>
            </label>
            <SelectFilter
              label="Work package"
              value={filters.workPackageId}
              onChange={(value) => setFilters((current) => ({ ...current, workPackageId: value }))}
              options={(workPackagesQuery.data ?? []).map((wp: any) => wp.id)}
            />
            <SelectFilter label="Profile" value={filters.profile} onChange={(value) => setFilters((current) => ({ ...current, profile: value }))} options={profiles} />
            <SelectFilter label="Grade" value={filters.grade} onChange={(value) => setFilters((current) => ({ ...current, grade: value }))} options={grades} />
            <SelectFilter label="Lifecycle" value={filters.lifecycle} onChange={(value) => setFilters((current) => ({ ...current, lifecycle: value }))} options={lifecycles} />
            <SelectFilter label="Source" value={filters.source} onChange={(value) => setFilters((current) => ({ ...current, source: value }))} options={sources} />
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Hold
              <select
                value={filters.hold}
                onChange={(event) => setFilters((current) => ({ ...current, hold: event.target.value as PieceRegisterFilters["hold"] }))}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800"
              >
                <option value="all">All</option>
                <option value="held">Held</option>
                <option value="clear">Clear</option>
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-black text-slate-900">Canonical pieces</h2>
              <p className="text-sm text-slate-500">{filteredRows.length} of {displayRows.length} rows shown</p>
            </div>
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-sm font-bold text-amber-700 hover:text-amber-900">Clear filters</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1380px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {["Mark / lot", "Qty", "Profile", "Grade", "Wt each", "Wt total", "Tons", "Work package", "Lifecycle", "Hold", "Source", "Last update"].map((label) => (
                    <th key={label} className="px-4 py-3 font-bold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((piece) => (
                  <tr key={piece.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-950">{piece.piece_mark}</div>
                      <div className="text-xs text-slate-500">
                        {piece.parent_piece_id ? `Child lot ${piece.lot_code}` : piece.lot_code === "ALL" ? "Root lot ALL" : `Container ${piece.lot_code}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{piece.quantity}</td>
                    <td className="px-4 py-3">{piece.profile || "—"}</td>
                    <td className="px-4 py-3">{piece.material_grade || "—"}</td>
                    <td className="px-4 py-3">{piece.weight_each_lbs == null ? "—" : Number(piece.weight_each_lbs).toFixed(1)}</td>
                    <td className="px-4 py-3">{piece.weight_total_lbs == null ? "—" : Number(piece.weight_total_lbs).toFixed(1)}</td>
                    <td className="px-4 py-3 font-black">{pieceTons(piece) == null ? "—" : pieceTons(piece)!.toFixed(3)}</td>
                    <td className="px-4 py-3">{piece.workPackageLabel}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{pieceLifecycleLabel(piece.lifecycle_status)}</span></td>
                    <td className="px-4 py-3">{piece.on_hold ? <span className="font-black text-rose-700">HELD</span> : <span className="text-slate-500">Clear</span>}</td>
                    <td className="px-4 py-3">
                      <div>{piece.source_system || "—"}</div>
                      <div className="max-w-40 truncate text-xs text-slate-400">{piece.external_ref || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{new Date(piece.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!piecesQuery.isLoading && filteredRows.length === 0 && (
                  <tr><td colSpan={12} className="px-6 py-14 text-center text-slate-500">No canonical pieces match this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <PieceControlPilotReadiness
          projectId={projectId}
          currentMode={mode as "off" | "shadow" | "pilot" | "live"}
        />

        <section>
          <PieceRelationshipManager
            projectId={projectId}
            pieceControlMode={mode}
          />
        </section>

        <PieceProductionControl
          projectId={projectId}
          pieceControlMode={mode}
        />

        <PieceLogisticsControl
          projectId={projectId}
          pieceControlMode={mode}
        />

        <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-800"><FileUp className="h-5 w-5" /></div>
              <div>
                <h2 className="font-black text-slate-900">Stage reconciled import</h2>
                <p className="text-sm text-slate-500">CSV or JSON parser output, no direct piece writes.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Source
                <select value={sourceType} onChange={(event) => setSourceType(event.target.value as PieceImportSourceType)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
                  {PIECE_IMPORT_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                File
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-dashed border-slate-300 p-3 text-sm" />
              </label>
              {importFile && <p className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{importFile.name}</strong><br />{importRows.length} rows ready to stage</p>}
              <button
                disabled={importRows.length === 0 || stageMutation.isPending}
                onClick={() => stageMutation.mutate()}
                className="h-11 rounded-lg bg-slate-950 px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {stageMutation.isPending ? "Reconciling..." : "Stage for review"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid border-b border-slate-200 lg:grid-cols-[260px_1fr]">
              <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
                <h2 className="mb-3 font-black text-slate-900">Import batches</h2>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => { setSelectedBatchId(batch.id); setApplyConfirmed(false); }}
                      className={`w-full rounded-xl border p-3 text-left ${selectedBatch?.id === batch.id ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold">{batch.source_name || batch.source_type}</span>
                        <span className="text-[10px] font-black uppercase text-slate-500">{batch.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{batch.row_count} rows · {new Date(batch.created_at).toLocaleDateString()}</div>
                    </button>
                  ))}
                  {batches.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No staged imports yet.</p>}
                </div>
              </div>

              <div className="min-w-0 p-4">
                {selectedBatch ? (
                  <>
                    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="font-black text-slate-950">{selectedBatch.source_name || selectedBatch.source_type}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(selectedBatch.decision_counts ?? {}).map(([decision, count]) => (
                            <span key={decision} className={`rounded-full border px-2 py-1 text-xs font-bold ${decisionTone[decision] ?? decisionTone.unchanged}`}>{decision.replace("_", " ")}: {count}</span>
                          ))}
                        </div>
                      </div>
                      {selectedBatch.status === "pending_review" ? (
                        <button disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">
                          Review complete · Approve
                        </button>
                      ) : selectedBatch.status === "approved" ? (
                        <div className="grid gap-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={applyConfirmed} onChange={(event) => setApplyConfirmed(event.target.checked)} />
                            Confirm eligible creates and updates
                          </label>
                          <button disabled={!applyConfirmed || applyMutation.isPending} onClick={() => applyMutation.mutate()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                            Apply approved batch
                          </button>
                        </div>
                      ) : (
                        <span className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Applied</span>
                      )}
                    </div>
                    <div className="mt-4 max-h-72 overflow-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500">
                          <tr><th className="p-2">Row</th><th className="p-2">Mark</th><th className="p-2">Decision</th><th className="p-2">Profile</th><th className="p-2">Grade</th><th className="p-2">Warnings / resolution</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(batchRowsQuery.data ?? []).map((row) => (
                            <tr key={row.id}>
                              <td className="p-2 text-slate-500">{row.source_row_number}</td>
                              <td className="p-2 font-black">{String(row.normalized_payload.piece_mark ?? "—")}</td>
                              <td className="p-2"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${decisionTone[row.decision] ?? decisionTone.unchanged}`}>{row.decision.replace("_", " ")}</span></td>
                              <td className="p-2">{String(row.normalized_payload.profile ?? "—")}</td>
                              <td className="p-2">{String(row.normalized_payload.material_grade ?? "—")}</td>
                              <td className="p-2 text-xs text-slate-600">{row.warnings.join("; ") || row.resolution || "No exceptions"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="grid min-h-64 place-items-center text-center text-slate-500">
                    <div><AlertTriangle className="mx-auto mb-3 h-7 w-7" /><p>Stage an import to review reconciliation results.</p></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
