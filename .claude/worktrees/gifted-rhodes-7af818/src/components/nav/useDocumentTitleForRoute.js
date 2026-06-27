import useDocumentTitle from "@/hooks/useDocumentTitle";
import { routeLabel, PROJECT_SCOPED_PAGES } from "@/routes";

/**
 * useDocumentTitleForRoute — keeps document.title in sync with the
 * current route. When the page is project-scoped (per
 * PROJECT_SCOPED_PAGES) and an active project is selected, the title
 * also includes the project name.
 *
 * Wraps the lower-level useDocumentTitle hook with the route-aware
 * suffix-building logic that used to live inline in Layout.jsx.
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its document-title plumbing.
 */
export function useDocumentTitleForRoute(currentPageName, activeProject) {
  const activeProjectName = activeProject?.name || activeProject?.project_name || null;
  const pageLabel = routeLabel(currentPageName);
  const titleSuffix =
    activeProjectName && PROJECT_SCOPED_PAGES.has(currentPageName)
      ? `${pageLabel} — ${activeProjectName}`
      : pageLabel;
  useDocumentTitle(titleSuffix);
}
