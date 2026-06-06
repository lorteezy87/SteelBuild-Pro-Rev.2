import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";

export const ProjectContext = createContext({
  activeProject: null,
  setActiveProject: () => {},
  // Apply a shallow patch to the currently-active project (and to its
  // entry in `projects` + the localStorage cache). Inline editors
  // call this after a successful Project.update so the dashboard's
  // `project` prop reflects the new value without waiting on a
  // refetch. Returns the merged project so callers can react to it.
  updateActiveProject: () => null,
  patchProject: () => null,
  removeProject: () => {},
  projects: [],
  // Same shape as `projects` but with on_hold=true projects removed. Used by
  // the switcher, portfolio, dashboards and every cross-project KPI rollup —
  // on-hold projects are visible only on the /Projects management page.
  activeProjects: [],
  // Fast lookup: id-set of active (non-on-hold) projects. KPI/aggregator
  // consumers filter child entities via `activeProjectIds.has(row.project_id)`.
  activeProjectIds: new Set(),
  loading: false,
  projectLoadError: null,
});

const PROJECTS_CACHE_KEY = "sbp_projects_cache";

function readProjectsCache() {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch {
    return [];
  }
}

function writeProjectsCache(projects) {
  try {
    if (projects.length > 0) {
      localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projects));
    } else {
      localStorage.removeItem(PROJECTS_CACHE_KEY);
    }
  } catch {
    /* ignore cache writes */
  }
}

export function ProjectProvider({ children }) {
  // Pull the user's saved prefs so we can honour `default_project_id`
  // when localStorage doesn't already hold an explicit selection. We
  // can't use `useAuth()` here (it throws when AuthProvider is missing
  // in tests) — useContext returns undefined in that case and we just
  // skip the default-project fallback.
  const auth = useContext(AuthContext);
  const authAllowsProjectLoad = !auth || (!auth.isLoadingAuth && auth.isAuthenticated);
  const defaultProjectIdPref =
    typeof auth?.user?.default_project_id === "string"
      ? auth.user.default_project_id
      : null;

  // Seed from cache so pages render immediately on hard refresh
  const [projects, setProjects] = useState(() => readProjectsCache());
  const [activeProject, setActiveProject] = useState(() => {
    const cached = readProjectsCache();
    const savedId = localStorage.getItem("activeProjectId");
    // Only restore if user explicitly saved a project — never auto-select first
    return savedId ? (cached.find((p) => p.id === savedId) || null) : null;
  });
  const [loading, setLoading] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState(null);

  // Load projects on mount — retries up to 3x in case SDK isn't ready yet
  useEffect(() => {
    if (!authAllowsProjectLoad) {
      if (auth?.isAuthenticated === false) {
        setLoading(false);
        setActiveProject(null);
      }
      return;
    }

    let cancelled = false;
    let retryTimer = null;

    const fetchProjects = async (attempt = 1) => {
      const raw = await entities.Project.list("-created_at");
      const data = [...raw].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      // If empty and we have retries left, wait and try again. Track the
      // backoff timer so the effect cleanup can clear it on unmount —
      // otherwise a pending setTimeout (1.5–3s) outlives the component and
      // keeps the process alive (in vitest's fork pool that surfaces as
      // "Timeout terminating forks worker").
      if (data.length === 0 && attempt < 3 && !cancelled) {
        await new Promise((r) => { retryTimer = setTimeout(r, attempt * 1500); });
        if (!cancelled) return fetchProjects(attempt + 1);
        return [];
      }
      return data;
    };

    const loadProjects = async () => {
      try {
        setLoading(true);
        const data = await fetchProjects();
        if (cancelled) return;

        setProjects(data);
        // Persist only confirmed live projects. A successful empty response
        // means the user has no active projects; never resurrect old cache.
        writeProjectsCache(data);

        // Resolution order for the active project:
        //   1. localStorage `activeProjectId` (most-recent explicit pick)
        //   2. user pref `default_project_id` from Settings → Dashboard
        //   3. nothing → portfolio view
        //
        // When the localStorage pick references a project that's been
        // deleted we fall through to the user pref; same when the user
        // pref references a missing project we fall through to portfolio.
        const list = data;
        const savedId = localStorage.getItem("activeProjectId");
        if (savedId) {
          const saved = list.find((p) => p.id === savedId);
          if (saved) {
            setActiveProject(saved);
          } else {
            // savedId points to a deleted project — fall back to default pref
            localStorage.removeItem("activeProjectId");
            const fallback = defaultProjectIdPref
              ? list.find((p) => p.id === defaultProjectIdPref)
              : null;
            if (fallback) {
              setActiveProject(fallback);
              try { localStorage.setItem("activeProjectId", fallback.id); } catch {}
            } else {
              setActiveProject(null);
            }
          }
        } else if (defaultProjectIdPref) {
          // No localStorage pick — honour the user's Settings default.
          // We don't write the activeProjectId back to localStorage so
          // that toggling the pref in Settings still takes effect on
          // the next session start.
          const def = list.find((p) => p.id === defaultProjectIdPref);
          setActiveProject(def || null);
        } else {
          setActiveProject(null);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
        if (!cancelled) setProjectLoadError(err?.message || "Failed to load projects");
        // Leave cached projects visible — don't wipe them on network error
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // defaultProjectIdPref is intentionally excluded from the dep list:
    // we resolve it once at startup. Changing the pref later in the
    // current session shouldn't yank the user out of whatever project
    // they've since picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAllowsProjectLoad, auth?.isAuthenticated]);

  const handleProjectSelect = (project) => {
    if (!project) {
      setActiveProject(null);
      localStorage.removeItem("activeProjectId");
      return;
    }
    setActiveProject(project);
    localStorage.setItem("activeProjectId", project.id);
  };

  // Shallow-merge a patch into the active project AND the project
  // record inside `projects` AND the localStorage cache, so every
  // consumer of useProjectContext sees the new value immediately
  // (no need to wait on a Supabase refetch). Idempotent — passing
  // the same patch twice is a no-op.
  const updateActiveProject = (patch) => {
    if (!patch || typeof patch !== "object") return activeProject;
    const id = activeProject?.id;
    if (!id) return activeProject;
    const merged = { ...activeProject, ...patch };
    setActiveProject(merged);
    setProjects((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const cache = readProjectsCache();
      const next = cache.map((p) => (p.id === id ? { ...p, ...patch } : p));
      writeProjectsCache(next);
    } catch {}
    return merged;
  };

  // Patch any project in the list (not just the active one). Used by edits
  // outside the active-project flow — e.g. toggling on_hold on a project
  // shown on the /Projects page — so the switcher's `activeProjects` (which
  // filters on_hold) reflects the change without waiting for the next
  // ProjectContext refetch on page load.
  const patchProject = (projectId, patch) => {
    if (!projectId || !patch || typeof patch !== "object") return null;
    setProjects((list) => {
      const next = list.map((p) => (p.id === projectId ? { ...p, ...patch } : p));
      try { writeProjectsCache(next); } catch {}
      return next;
    });
    if (activeProject?.id === projectId) {
      setActiveProject((prev) => (prev ? { ...prev, ...patch } : prev));
    }
    return null;
  };

  const removeProject = (projectId) => {
    if (!projectId) return;
    setProjects((list) => {
      const next = list.filter((p) => p.id !== projectId);
      writeProjectsCache(next);
      return next;
    });
    if (activeProject?.id === projectId) {
      handleProjectSelect(null);
    }
  };

  // Active (non-on-hold) projects + id set. Derived from `projects` and
  // memoised so consumers can use them as stable React dependencies. An
  // on-hold project is paused and must not appear in the switcher, portfolio,
  // dashboards or any KPI rollup — only the /Projects page sees them.
  const activeProjects = useMemo(
    () => projects.filter((p) => p && p.on_hold !== true),
    [projects]
  );
  const activeProjectIds = useMemo(
    () => new Set(activeProjects.map((p) => p.id).filter(Boolean)),
    [activeProjects]
  );

  // If the currently-active project is put on hold, auto-deselect it so the
  // user isn't silently working in a paused project. The /Projects page
  // remains the way to drill back in.
  useEffect(() => {
    if (activeProject?.on_hold === true) {
      handleProjectSelect(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, activeProject?.on_hold]);

  return (
    <ProjectContext.Provider value={{
      activeProject,
      setActiveProject: handleProjectSelect,
      updateActiveProject,
      patchProject,
      removeProject,
      projects,
      activeProjects,
      activeProjectIds,
      loading,
      projectLoadError,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProjectContext must be used within ProjectProvider");
  }
  return context;
}
