import React, { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { usePermissions } from "@/services/permissions";
import { useFlag } from "@/hooks/useFeatureFlag";
import DrawingsPageView from "./drawings/DrawingsPageView";
import { useDrawingsPageController } from "./drawings/useDrawingsPageController";
import { useDrawingsPageData } from "./drawings/useDrawingsPageData";
import { useDrawingsPageState } from "./drawings/useDrawingsPageState";

export default function Drawings({ embedded = false } = {}) {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = usePermissions();
  const projectId = activeProject?.id;
  const revisionAiEnabled = useFlag("revision_ai_diff");
  const workdayDues = useFlag("submittal_workday_dues");
  const state = useDrawingsPageState(searchParams);
  const filters = useMemo(
    () => ({
      search: state.search,
      discipline: state.discipline,
      stageFilter: state.stageFilter,
      setFilterId: state.setFilterId,
    }),
    [
      state.discipline,
      state.search,
      state.setFilterId,
      state.stageFilter,
    ],
  );
  const data = useDrawingsPageData({
    projectId,
    filters,
    selected: state.selected,
    workdayDues,
  });
  const controller = useDrawingsPageController({
    activeProject,
    projectId,
    queryClient,
    navigate,
    data,
    state,
  });

  return (
    <DrawingsPageView
      activeProject={activeProject}
      embedded={embedded}
      revisionAiEnabled={revisionAiEnabled}
      canCreateDrawing={can("create", "drawing")}
      canEditDrawing={can("edit", "drawing")}
      canDeleteDrawing={can("delete", "drawing")}
      navigate={navigate}
      data={data}
      state={state}
      controller={controller}
    />
  );
}
