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
    return cached.find((p) => p.id === savedId) || cached[0] || null;
  });
  const [loading, setLoading] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState(null);

  // Load projects on mount — updates cache for next refresh
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const data = await base44.entities.Project.list("-created_date");
        setProjects(data);
        // Persist to localStorage cache so next hard refresh is instant
        try { localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(data)); } catch {}

        // Try to restore last selected project
        const savedId = localStorage.getItem("activeProjectId");
        const saved = data.find((p) => p.id === savedId);

        // Default selection: saved → first active → first in list
        const defaultProject = saved || data.find((p) => p.health_status) || data[0] || null;

        if (defaultProject) {
          setActiveProject(defaultProject);
          localStorage.setItem("activeProjectId", defaultProject.id);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
        setProjectLoadError(err?.message || "Failed to load projects");
        // Leave cached projects visible — don't wipe them on network error
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
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