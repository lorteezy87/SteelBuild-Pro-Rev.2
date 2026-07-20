import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Database,
  Factory,
  FileUp,
  GitBranch,
  PackageOpen,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
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

type PieceControlMode = "off" | "shadow" | "pilot" | "live";

const REGISTER_VIEWS = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "register", label: "Piece register", icon: PackageOpen },
  { id: "import", label: "Imports", icon: FileUp },
  { id: "relationships", label: "Lots & links", icon: GitBranch },
  { id: "production", label: "Production", icon: Factory },
  { id: "logistics", label: "Logistics", icon: Truck },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

type PieceRegisterView = (typeof REGISTER_VIEWS)[number]["id"];

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
  options: Array<string | { value: string; label: string }>;
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
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return <option key={value} value={value}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

export default function PieceRegister() {
  const { activeProject, updateActiveProject } = useProjectContext() as any;
  const projectId = activeProject?.id as string | undefined;
  const mode = String(activeProject?.piece_control_mode ?? "off");
  const enabled = Boolean(projectId && mode !== "off");
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<PieceRegisterView>("overview");
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
  const pieceSummary = useMemo(
    () => displayRows.reduce(
      (summary, piece) => {
        summary.quantity += Number(piece.quantity ?? 0);
        summary.tons += pieceTons(piece) ?? 0;
        if (piece.on_hold) summary.held += 1;
        if (!piece.work_package_id) summary.unassigned += 1;
        return summary;
      },
      { quantity: 0, tons: 0, held: 0, unassigned: 0 },
    ),
    [displayRows],
  );

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

  const handleModeChanged = (nextMode: PieceControlMode) => {
    updateActiveProject?.({ piece_control_mode: nextMode });
    if (nextMode !== "off") setActiveView("import");
  };

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
      <div className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-300/40 md:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-400">Fabrication control</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Set up the Piece Register</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Turn imported piece data into a controlled project register for lot tracking,
                shop progress, shipping, delivery, and erection.
              </p>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              ["1", "Enable controlled mode", "Start in shadow mode. Existing production and release workflows remain unchanged."],
              ["2", "Stage a piece file", "Upload CSV or JSON, review matches and exceptions, then approve the batch."],
              ["3", "Run the workflow", "Organize lots, advance shop stations, and record logistics from one project register."],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-900">
                  {step}
                </div>
                <h2 className="mt-4 font-black text-slate-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </section>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <div className="font-black">Admin setup required</div>
                <p className="mt-1 text-amber-900/80">
                  A project owner or admin must move this project from Off to Shadow below.
                  Shadow mode creates the register without replacing current downstream workflows.
                </p>
              </div>
            </div>
          </div>

          <PieceControlPilotReadiness
            projectId={projectId}
            currentMode="off"
            onModeChanged={handleModeChanged}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,_#fef3c7,_transparent_25%),linear-gradient(180deg,#f8fafc,#eef2f7)] p-4 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <header className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-300/40 md:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-400">Fabrication control</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Piece Register</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                The project source for piece quantities, lots, work-package assignments,
                shop progress, shipping, delivery, and erection.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveView("import")}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 hover:bg-amber-300"
              >
                <FileUp className="h-4 w-4" />
                Import pieces
              </button>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                <div className="text-lg font-black text-white">{mode.toUpperCase()}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Control mode</div>
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="Piece Register sections" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {REGISTER_VIEWS.map(({ id, label, icon: Icon }) => {
              const selected = activeView === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setActiveView(id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition ${selected ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {activeView === "overview" && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Piece rows", displayRows.length.toLocaleString()],
                ["Total quantity", pieceSummary.quantity.toLocaleString()],
                ["Total tons", pieceSummary.tons.toFixed(1)],
                ["On hold", pieceSummary.held.toLocaleString()],
                ["Unassigned", pieceSummary.unassigned.toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-2xl font-black text-slate-950">{value}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Piece workflow</h2>
                  <p className="mt-1 text-sm text-slate-600">A controlled path from source file to erection history.</p>
                </div>
                <button type="button" onClick={() => setActiveView(displayRows.length === 0 ? "import" : "register")} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">
                  {displayRows.length === 0 ? "Import the first pieces" : "Open the register"}
                </button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {[
                  ["01", "Import & reconcile", "Stage source data and resolve conflicts before anything is written."],
                  ["02", "Organize lots", "Assign work packages and split quantities while preserving traceability."],
                  ["03", "Track production", "Advance released lots through controlled shop stations."],
                  ["04", "Move to the field", "Record shipping, delivery, and erection with an immutable history."],
                ].map(([step, title, description]) => (
                  <div key={step} className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-700">{step}</div>
                    <div className="mt-2 font-black text-slate-900">{title}</div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "register" && (
          <>
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
              options={(workPackagesQuery.data ?? []).map((wp: any) => ({
                value: wp.id,
                label: wp.wp_number || wp.name || wp.title || "Unnamed package",
              }))}
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
                {piecesQuery.isLoading && (
                  <tr><td colSpan={12} className="px-6 py-14 text-center text-slate-500">Loading the project piece register...</td></tr>
                )}
                {piecesQuery.error && (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center">
                      <div className="font-black text-red-700">The Piece Register could not be loaded.</div>
                      <div className="mt-1 text-sm text-slate-600">{(piecesQuery.error as Error).message}</div>
                      <button type="button" onClick={() => piecesQuery.refetch()} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800">Try again</button>
                    </td>
                  </tr>
                )}
                {!piecesQuery.isLoading && !piecesQuery.error && filteredRows.map((piece) => (
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
                {!piecesQuery.isLoading && !piecesQuery.error && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-6 py-14 text-center">
                      <PackageOpen className="mx-auto h-8 w-8 text-slate-300" />
                      <div className="mt-3 font-black text-slate-800">
                        {displayRows.length === 0 ? "No pieces have been imported yet." : "No pieces match these filters."}
                      </div>
                      <button
                        type="button"
                        onClick={() => displayRows.length === 0 ? setActiveView("import") : setFilters(EMPTY_FILTERS)}
                        className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white"
                      >
                        {displayRows.length === 0 ? "Import pieces" : "Clear filters"}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
          </>
        )}

        {activeView === "settings" && (
          <PieceControlPilotReadiness
            projectId={projectId}
            currentMode={mode as PieceControlMode}
            onModeChanged={handleModeChanged}
          />
        )}

        {activeView === "relationships" && (
          <section>
            <PieceRelationshipManager
              projectId={projectId}
              pieceControlMode={mode}
            />
          </section>
        )}

        {activeView === "production" && (
          <PieceProductionControl
            projectId={projectId}
            pieceControlMode={mode}
          />
        )}

        {activeView === "logistics" && (
          <PieceLogisticsControl
            projectId={projectId}
            pieceControlMode={mode}
          />
        )}

        {activeView === "import" && (
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
        )}
      </div>
    </div>
  );
}
