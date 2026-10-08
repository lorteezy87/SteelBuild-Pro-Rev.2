import { Navigate, useLocation } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";

/**
 * Discoverable entrance to the existing model tab. Keep its feature-flag,
 * permission, lazy-loading, and roster behavior in the hub's single owner.
 * AppRoutes applies ProjectScopedRoute before this entry and at its target.
 */
export default function IfcModelViewer() {
  const location = useLocation();
  // The legacy JS context infers its null default; only the selected ID is
  // consumed here, after ProjectScopedRoute has verified that selection.
  const activeProject = useProjectContext().activeProject as { id: string } | null;
  const params = new URLSearchParams(location.search);
  params.set("hub_tab", "model3d");

  // Never overwrite an explicit deep-link project with the previous selection.
  // Pin a nav entry's current project so the resulting link can be bookmarked.
  if (!params.get("projectId") && !params.get("project") && activeProject?.id) {
    params.set("projectId", activeProject.id);
  }

  return <Navigate replace to={{ pathname: "/DrawingSubmittalHub", search: `?${params}`, hash: location.hash }} />;
}
