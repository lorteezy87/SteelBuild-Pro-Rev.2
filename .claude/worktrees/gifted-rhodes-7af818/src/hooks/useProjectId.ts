import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";

/**
 * Single source of truth for resolving the active project ID.
 *
 * Resolution order:
 *   1. ?projectId= query param  (canonical, used by deep links)
 *   2. ?project=   query param  (legacy alias — older Command Center / dashboard links)
 *   3. activeProject.id from ProjectContext  (the project the user has selected)
 *   4. null                                  (portfolio mode)
 *
 * Use this in EVERY page that needs a project ID. Inline variants tend to
 * forget the activeProject fallback (e.g. Contacts.jsx used to scope only
 * by the URL param, so picking a project from the switcher had no effect
 * on that page).
 */
export function useProjectId(): string | null {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  return (
    searchParams.get("projectId") ||
    searchParams.get("project") ||
    activeProject?.id ||
    null
  );
}
