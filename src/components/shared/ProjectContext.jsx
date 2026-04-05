import { createContext, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export const ProjectContext = createContext({
  activeProject: null,
  setActiveProject: () => {},
  projects: [],
  loading: false,
  projectLoadError: null,
});

const PROJECTS_CACHE_KEY = "sbp_projects_cache";

function readProjectsCache() {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function ProjectProvider({ children }) {
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
    let cancelled = false;

    const fetchProjects = async (attempt = 1) => {
      const data = await base44.entities.Project.list("-created_date");
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

        // Only restore the project the user explicitly had selected — never auto-pick
        const savedId = localStorage.getItem("activeProjectId");
        if (savedId) {
          const list = data.length > 0 ? data : readProjectsCache();
          const saved = list.find((p) => p.id === savedId);
          if (saved) {
            setActiveProject(saved);
          }
          // If savedId no longer exists in the list, clear it so portfolio shows
          else {
            localStorage.removeItem("activeProjectId");
            setActiveProject(null);
          }
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
  }, []);

  const handleProjectSelect = (project) => {
    if (!project) {
      setActiveProject(null);
      localStorage.removeItem("activeProjectId");
      return;
    }
    setActiveProject(project);
    localStorage.setItem("activeProjectId", project.id);
  };

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject: handleProjectSelect, projects, loading, projectLoadError }}>
      {children}
    </ProjectContext.Provider>
  );
}