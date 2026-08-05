import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DailyLogForm from "@/components/fieldops/DailyLogForm";
import DailyLogsList from "@/components/fieldops/DailyLogsList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, Button } from "@/components/design-system";
import { Copy } from "lucide-react";
import { logActivity } from "@/services/auditLogger";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useOutbox } from "@/lib/field/OutboxContext";
import { makeDailyLogCreateOp, newClientOpId, isLikelyOfflineError } from "@/lib/field/offlineQueue";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { usePermissions } from "@/services/permissions";

import {
  filterLiveDailyLogs,
  filterDailyLogs,
  computeDailyLogMetrics,
  pickMostRecentDailyLog,
  buildCopyFromRecentLogSeed,
  DAILY_LOGS_COMMAND_SUBTITLE,
  utcIsoDate,
} from "./dailyLogs/dailyLogsPageHelpers";
import {
  DailyLogsKpiStrip,
  DailyLogsFilterBar,
  DailyLogsLoadError,
} from "./dailyLogs/DailyLogsUi";

import { findById } from "@/pages/shared/findById";
export default function DailyLogs() {
  const projectId = useProjectId();
  const { can } = usePermissions();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all");

  const qc = useQueryClient();
  const { enqueue: enqueueOutbox, flush: flushOutbox } = useOutbox();

  useAutoOpenCreate(() => {
    setEditing(null);
    setShowForm(true);
  });

  const dailyLogQueryKeys = [["daily-logs", projectId]];

  const {
    data: rawLogs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["daily-logs", projectId],
    queryFn: () =>
      projectId
        ? entities.DailyLog.filter({ project_id: projectId })
        : entities.DailyLog.list("-date"),
  });

  useRealtimeInvalidation("daily_logs", projectId, dailyLogQueryKeys);

  // Defensive in-memory soft-delete filter — the entity client does this
  // at fetch time, but a stale cache from before the migration could still
  // surface deleted rows. Mirrors the BudgetHours / Procurement pattern.
  const logs = useMemo(() => filterLiveDailyLogs(rawLogs), [rawLogs]);

  // Field Hub rows deep-link here with ?id=<log>; open it for edit.
  useAutoOpenEdit(
    logs,
    (log) => { setEditing(log); setShowForm(true); },
    { enabled: !isLoading },
  );

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const filteredLogs = useMemo(
    () => filterDailyLogs(logs, { dateRange, searchTerm }),
    [logs, searchTerm, dateRange],
  );

  // Key metrics computed from filtered logs
  const metrics = useMemo(
    () => computeDailyLogMetrics(filteredLogs),
    [filteredLogs],
  );

  const createMut = useMutation({
    mutationFn: (data) => entities.DailyLog.create(withProjectId(data, projectId)),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, dailyLogQueryKeys, created);
      toast.success("Daily log created");
      setShowForm(false);
      setEditing(null);
      await invalidateCrudQueries(qc, dailyLogQueryKeys);
      // Audit trail — fire-and-forget
      logActivity("daily_log", "created", created, {
        projectId,
        description: `Daily log for ${created?.date || "today"}`,
      });
      flushOutbox(); // online write succeeded → drain any offline backlog
    },
    onError: (err, data) => {
      // No signal at end of day? Queue the log instead of losing it. The
      // client_op_id (minted in handleSave) rides both this attempt and the
      // replay, dedup'd against daily_logs.uq_daily_logs_client_op_id. Photos
      // in the log are online-only — an offline log syncs its text/manning data.
      if (isLikelyOfflineError(err)) {
        enqueueOutbox(makeDailyLogCreateOp(data, data.client_op_id, Date.now()));
        setShowForm(false);
        setEditing(null);
        toast.message("Saved offline — will sync when you're back online");
        return;
      }
      toastCrudError(err, "Failed to create daily log");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.DailyLog.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, dailyLogQueryKeys, updated);
      toast.success("Daily log updated");
      setShowForm(false);
      setEditing(null);
      await invalidateCrudQueries(qc, dailyLogQueryKeys);
      logActivity("daily_log", "updated", updated, {
        projectId,
        description: `Daily log for ${updated?.date || ""}`,
      });
    },
    onError: (err) => toastCrudError(err, "Failed to update daily log"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.DailyLog.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, dailyLogQueryKeys, deletedId);
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      toast.success("Daily log deleted");
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, dailyLogQueryKeys);
      logActivity("daily_log", "deleted", { id: deletedId }, { projectId });
    },
    onError: (err) => toastCrudError(err, "Failed to delete daily log"),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      // Mint the idempotency key up front so it rides BOTH the online create and
      // any offline retry (dedup'd server-side on replay).
      createMut.mutate({ ...data, client_op_id: newClientOpId() });
    }
  };

  const handleCopyFromYesterday = () => {
    const mostRecent = pickMostRecentDailyLog(logs);
    if (!mostRecent) {
      toast.error("No previous logs to copy from");
      return;
    }
    const today = utcIsoDate();
    setEditing(buildCopyFromRecentLogSeed(mostRecent, today));
    setShowForm(true);
  };

  const selectedProject = findById(projects, projectId);

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Daily Logs"
        count={filteredLogs.length}
        unit=" · ENTRIES"
        subtitle={DAILY_LOGS_COMMAND_SUBTITLE}
      >
        {can("create", "daily_log") && (
          <Button variant="secondary" onClick={handleCopyFromYesterday}>
            <Copy size={12} /> Copy Yesterday
          </Button>
        )}
        {can("create", "daily_log") && (
          <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setShowForm(true); }}>
            New Log
          </Button>
        )}
      </CommandBar>

      <DailyLogsKpiStrip metrics={metrics} />

      <DailyLogsFilterBar
        searchTerm={searchTerm}
        dateRange={dateRange}
        onSearchTerm={setSearchTerm}
        onDateRange={setDateRange}
      />

      {/* Form */}
      {showForm && (
        <DailyLogForm
          projectId={projectId}
          log={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Logs List — gate loading/error so empty chrome does not flash */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : isError ? (
        <DailyLogsLoadError
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
        />
      ) : (
        <DailyLogsList
          logs={filteredLogs}
          onEdit={can("edit", "daily_log") ? (log) => { setEditing(log); setShowForm(true); } : null}
          onDelete={can("delete", "daily_log") ? (log) => setDeleteTarget(log) : null}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Daily Log"
        description={`Delete log for ${deleteTarget?.date}? This cannot be undone.`}
      />
    </div>
  );
}

