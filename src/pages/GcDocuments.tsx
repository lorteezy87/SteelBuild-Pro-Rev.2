/**
 * GcDocuments — the register of what the GC sends US.
 *
 * GC drawings, ASIs, addenda, bulletins, CCDs and contract documents live on
 * gc_drawing_sets / gc_drawings — a SEPARATE namespace from drawings /
 * drawing_sets, which are our shop drawings. A sheet number appearing in both
 * is not the same sheet, and nothing here can release steel for fabrication.
 *
 * Composition only; every concern lives in ./gcDocuments/.
 */

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { usePermissions } from "@/services/permissions";
import GcDocumentsPageView from "./gcDocuments/GcDocumentsPageView";
import { useGcDocumentsPageController } from "./gcDocuments/useGcDocumentsPageController";
import { useGcDocumentsPageData } from "./gcDocuments/useGcDocumentsPageData";
import { useGcDocumentsPageState } from "./gcDocuments/useGcDocumentsPageState";

export default function GcDocuments() {
  const { activeProject: activeProjectRaw } = useProjectContext();
  // ProjectContext.jsx is untyped JS, so activeProject infers as `null`/`never`.
  // Cast at the boundary to its real shape (drop once ProjectContext is typed),
  // mirroring the same boundary cast in useProjectId.ts and Deliveries.tsx.
  const activeProject = activeProjectRaw as { id?: string | null; name?: string | null } | null;
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { can } = usePermissions();
  // useProjectId, not activeProject.id — it also honours ?projectId= / ?project=
  // deep links, which is how the dashboard and alerts point at one project.
  const projectId = useProjectId();

  const state = useGcDocumentsPageState(searchParams);

  const filters = useMemo(
    () => ({ search: state.search, docType: state.docType, impact: state.impact }),
    [state.search, state.docType, state.impact],
  );

  const data = useGcDocumentsPageData({ projectId, filters });
  const controller = useGcDocumentsPageController({
    projectId,
    queryClient,
    data,
    state,
  });

  return (
    <GcDocumentsPageView
      projectId={projectId}
      projectName={activeProject?.name}
      // Mirrors the RLS on both tables: read needs project access, write needs
      // PM. canPerform() falls through to the `create`/`edit` action floors
      // (both `pm`) for this entity, which is exactly the database's rule.
      canCreate={can("create", "gc_document")}
      canEdit={can("edit", "gc_document")}
      canDelete={can("delete", "gc_document")}
      data={data}
      state={state}
      controller={controller}
    />
  );
}
