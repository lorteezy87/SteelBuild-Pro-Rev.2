/**
 * Canonical Budget Control route.
 * Legacy cost pages redirect here.
 */
import { useProjectContext } from "@/components/shared/ProjectContext";
import CostControlCenter from "./costHub/CostControlCenter";

export default function CostHub() {
  const { activeProject } = useProjectContext();
  if (!activeProject?.id) return null;
  return (
    <CostControlCenter
      projectId={activeProject.id}
      project={activeProject}
    />
  );
}
