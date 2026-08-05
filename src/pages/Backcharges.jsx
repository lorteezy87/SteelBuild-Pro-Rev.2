/**
 * Backcharges — Backcharge / CO Defense web entry (Phase 1).
 *
 * PM logs a backcharge (who/what/why/$ + the contractually-critical notice date),
 * attaches T&M cost build-up tickets, and generates a defense package (manifest
 * CSV + cover README) backed by an append-only timestamped audit trail. Reads/
 * writes go through the typed repository (src/lib/backcharge); the server RLS
 * enforces pm+ for writes.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/ProjectContext";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { downloadTextFile } from "@/lib/exports/fabRelease";
import {
  addTmTicket,
  createBackcharge,
  listBackcharges,
  listEvents,
  listTmTickets,
  softDeleteBackcharge,
  softDeleteTmTicket,
  updateBackcharge,
} from "@/lib/backcharge/repository";
import {
  buildBackchargeRegisterCsv,
  buildDefenseManifestCsv,
  suggestDefenseFilename,
} from "@/lib/backcharge/defensePackage";
import { buildDefensePdf } from "@/lib/backcharge/defensePdf";
import { entities } from "@/api/supabaseClient";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import BackchargeControlCenter from "./backcharges/BackchargeControlCenter";
import { filterBackcharges } from "./backcharges/backchargeControlCenter.derive";
import { buildIdMap } from "./backcharges/backchargesPageHelpers";
import {
  BackchargeFormModal,
  BackchargeDetailPanel,
  bcMono as mono,
} from "./backcharges/BackchargesUi";

/** Re-export for RevisionImpactReportModal and other importers. */
export { BackchargeFormModal } from "./backcharges/BackchargesUi";

export default function Backcharges() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ccSearch, setCcSearch] = useState("");
  const [ccStatusFilter, setCcStatusFilter] = useState("all");

  const { data: backcharges = [], isLoading } = useQuery({
    queryKey: ["backcharges", projectId],
    queryFn: () => listBackcharges(projectId),
    enabled: !!projectId,
  });
  const selected = backcharges.find((b) => b.id === selectedId) || null;

  // Change orders + RFIs for the link pickers / resolved numbers in the package.
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders", projectId], queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });
  const { data: rfis = [] } = useQuery({ queryKey: ["rfis", projectId], queryFn: () => entities.RFI.filter({ project_id: projectId }), enabled: !!projectId, staleTime: 60_000 });
  const coById = useMemo(() => buildIdMap(changeOrders || []), [changeOrders]);
  const rfiById = useMemo(() => buildIdMap(rfis || []), [rfis]);
  const withLinkNumbers = (bc) => (bc ? {
    ...bc,
    linked_co_number: bc.linked_co_id ? coById.get(bc.linked_co_id)?.co_number || null : null,
    source_rfi_number: bc.source_rfi_id ? rfiById.get(bc.source_rfi_id)?.rfi_number || null : null,
  } : bc);

  const { data: tickets = [] } = useQuery({ queryKey: ["backcharge-tickets", selectedId], queryFn: () => listTmTickets(selectedId), enabled: !!selectedId });
  const { data: events = [] } = useQuery({ queryKey: ["backcharge-events", selectedId], queryFn: () => listEvents(selectedId), enabled: !!selectedId });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["backcharges", projectId] });
    if (selectedId) {
      qc.invalidateQueries({ queryKey: ["backcharge-tickets", selectedId] });
      qc.invalidateQueries({ queryKey: ["backcharge-events", selectedId] });
    }
  };

  const createMut = useMutation({
    mutationFn: (form) => createBackcharge(withProjectId({ ...form }, projectId)),
    onSuccess: (bc) => { refetchAll(); setFormOpen(false); setEditing(null); setSelectedId(bc.id); toast.success("Backcharge created"); },
    onError: (e) => {
      const msg = toUserErrorMessage(e);
      toast.error(msg.includes("row-level security") ? "Only PM+ can create backcharges." : `Create failed: ${msg}`);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch, prev }) => updateBackcharge(id, patch, prev),
    onSuccess: () => { refetchAll(); setFormOpen(false); setEditing(null); toast.success("Saved"); },
    onError: (e) => toast.error(`Save failed: ${toUserErrorMessage(e)}`),
  });
  const addTicketMut = useMutation({
    mutationFn: (t) => addTmTicket(withProjectId({
      ...t, backcharge_id: selectedId,
      labor_hours: Number(t.labor_hours) || 0, labor_rate: Number(t.labor_rate) || 0,
      equipment_cost: Number(t.equipment_cost) || 0, material_cost: Number(t.material_cost) || 0,
      markup_percent: Number(t.markup_percent) || 0, ticket_date: t.ticket_date || null,
    }, projectId)),
    onSuccess: () => { refetchAll(); toast.success("T&M ticket added"); },
    onError: (e) => toast.error(`Add failed: ${toUserErrorMessage(e)}`),
  });
  const delTicketMut = useMutation({
    mutationFn: (id) => softDeleteTmTicket(id),
    onSuccess: () => { refetchAll(); },
    onError: (e) => toast.error(`Delete failed: ${toUserErrorMessage(e)}`),
  });
  const delMut = useMutation({
    mutationFn: (id) => softDeleteBackcharge(id),
    onSuccess: () => { refetchAll(); setSelectedId(null); toast.success("Deleted"); },
    onError: (e) => toast.error(`Delete failed: ${toUserErrorMessage(e)}`),
  });

  const exportDefense = async (bc0) => {
    try {
      const bc = withLinkNumbers(bc0);
      const [tks, evs] = await Promise.all([listTmTickets(bc.id), listEvents(bc.id)]);
      const stem = suggestDefenseFilename(bc, activeProject);
      buildDefensePdf({ backcharge: bc, tickets: tks, events: evs, project: activeProject }).save(`${stem}.pdf`);
      downloadTextFile(buildDefenseManifestCsv(bc, tks, evs), `${stem}_manifest.csv`, "text/csv;charset=utf-8");
      toast.success("Defense package exported (PDF + CSV)");
    } catch (e) { toast.error(`Export failed: ${toUserErrorMessage(e)}`); }
  };

  if (!projectId) return <div style={{ ...mono, padding: 24, color: "var(--text-muted)" }}>Select a project to manage backcharges.</div>;
  const filtered = filterBackcharges(backcharges, ccSearch, ccStatusFilter);
  const handleExport = () => downloadTextFile(buildBackchargeRegisterCsv(backcharges), "backcharge_register.csv", "text/csv;charset=utf-8");

  if (isLoading) {
    return <div style={{ padding: 24 }}><LoadingSkeleton variant="page" /></div>;
  }

  return (
    <>
      <BackchargeControlCenter
        projectName={activeProject?.name || "Project"}
        backcharges={backcharges}
        filtered={filtered}
        search={ccSearch}
        onSearch={setCcSearch}
        statusFilter={ccStatusFilter}
        onStatusFilter={setCcStatusFilter}
        onOpen={(b) => { setSelectedId(b.id); setEditing(null); }}
        onExport={handleExport}
        onCreate={() => { setEditing(null); setFormOpen(true); }}
      />

      {selected && (
        <BackchargeDetailPanel
          selected={withLinkNumbers(selected)}
          tickets={tickets}
          events={events}
          onClose={() => setSelectedId(null)}
          onStatusChange={(status) => updateMut.mutate({ id: selected.id, patch: { status }, prev: selected })}
          onEdit={() => { setEditing(selected); setFormOpen(true); }}
          onExport={() => exportDefense(selected)}
          onDelete={() => delMut.mutate(selected.id)}
          onDeleteTicket={(id) => delTicketMut.mutate(id)}
          onAddTicket={(t) => addTicketMut.mutate(t)}
          addTicketBusy={addTicketMut.isPending}
        />
      )}

      <BackchargeFormModal
        key={editing?.id || "new"}
        open={formOpen}
        initial={editing}
        changeOrders={changeOrders}
        rfis={rfis}
        busy={createMut.isPending || updateMut.isPending}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(form) => {
          if (editing?.id) {
            const { id: _id, ...patch } = form;
            updateMut.mutate({ id: editing.id, patch, prev: editing });
          } else {
            createMut.mutate(form);
          }
        }}
      />
    </>
  );
}
