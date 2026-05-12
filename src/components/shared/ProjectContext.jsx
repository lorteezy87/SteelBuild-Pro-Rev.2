import { createContext, useState, useEffect, useContext } from "react";
import { base44 } from "@/api/base44Client";
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
  projects: [],
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

    const fetchProjects = async (attempt = 1) => {
      const raw = await base44.entities.Project.list("-created_at");
      const data = [...raw].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      // If empty and we have retries left, wait and try again
      if (data.length === 0 && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
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

        if (data.length > 0) {
          setProjects(data);
          // Persist to localStorage so next hard refresh is instant
          try { localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(data)); } catch {}
        }

        // Resolution order for the active project:
        //   1. localStorage `activeProjectId` (most-recent explicit pick)
        //   2. user pref `default_project_id` from Settings → Dashboard
        //   3. nothing → portfolio view
        //
        // When the localStorage pick references a project that's been
        // deleted we fall through to the user pref; same when the user
        // pref references a missing project we fall through to portfolio.
        const list = data.length > 0 ? data : readProjectsCache();
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
          if (def) setActiveProject(def);
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
    return () => { cancelled = true; };
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
      localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(next));
    } catch {}
    return merged;
  };

  return (
    <ProjectContext.Provider value={{
      activeProject,
      setActiveProject: handleProjectSelect,
      updateActiveProject,
      projects,
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
