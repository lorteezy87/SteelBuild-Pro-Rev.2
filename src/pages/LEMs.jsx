import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@/services/cacheRegistry";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  LaborTab,
  EquipmentTab,
  MaterialsTab,
  LemsNoProjectState,
  LemsLoadingState,
  LemsErrorState,
  LemsPageShell,
} from "./lems/LemsUi";

export default function LEMs() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id || null;
  const [activeTab, setActiveTab] = useState("LABOR");

  // ── Queries ─────────────────────────────────────────────────────────────

  const {
    data: dailyLogs = [],
    isLoading: logsLoading,
    isError: logsError,
    error: logsErrorValue,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: getQueryKey("daily_log", projectId),
    queryFn: () => entities.DailyLog.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: workPackages = [],
    isLoading: wpLoading,
    isError: wpError,
    error: wpErrorValue,
    refetch: refetchWp,
  } = useQuery({
    queryKey: getQueryKey("work_package", projectId),
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    isLoading: expLoading,
    isError: expError,
    error: expErrorValue,
    refetch: refetchExp,
  } = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: deliveries = [],
    isLoading: delLoading,
    isError: delError,
    error: delErrorValue,
    refetch: refetchDel,
  } = useQuery({
    queryKey: getQueryKey("delivery", projectId),
    queryFn: () => entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = logsLoading || wpLoading || expLoading || delLoading;
  const isError = logsError || wpError || expError || delError;
  const loadError = logsErrorValue || wpErrorValue || expErrorValue || delErrorValue;
  const refetchAll = () => {
    refetchLogs();
    refetchWp();
    refetchExp();
    refetchDel();
  };

  // ── Guards ──────────────────────────────────────────────────────────────

  if (!projectId) {
    return <LemsNoProjectState />;
  }

  if (isLoading) {
    return <LemsLoadingState />;
  }

  if (isError) {
    return <LemsErrorState error={loadError} onRetry={refetchAll} />;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <LemsPageShell
      projectName={activeProject?.name}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "LABOR" && (
        <LaborTab workPackages={workPackages} dailyLogs={dailyLogs} />
      )}

      {activeTab === "EQUIPMENT" && (
        <EquipmentTab dailyLogs={dailyLogs} />
      )}

      {activeTab === "MATERIALS" && (
        <MaterialsTab workPackages={workPackages} deliveries={deliveries} />
      )}
    </LemsPageShell>
  );
}
