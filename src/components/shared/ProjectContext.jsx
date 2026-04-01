import { createContext, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export const ProjectContext = createContext({
  activeProject: null,
  setActiveProject: () => {},
  projects: [],
  loading: false,
  refreshProjects: async () => {},
});

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await base44.entities.Project.list("-created_date");
      setProjects(data);

      const savedId = localStorage.getItem("activeProjectId");
      const saved = data.find((p) => p.id === savedId);
      const current = activeProject ? data.find((p) => p.id === activeProject.id) : null;
      const defaultProject = current || saved || data.find((p) => p.health_status) || data[0] || null;

      if (defaultProject) {
        setActiveProject(defaultProject);
        localStorage.setItem("activeProjectId", defaultProject.id);
      } else {
        setActiveProject(null);
        localStorage.removeItem("activeProjectId");
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load projects on mount
  useEffect(() => {
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
    <ProjectContext.Provider value={{ activeProject, setActiveProject: handleProjectSelect, projects, loading, refreshProjects: loadProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}
