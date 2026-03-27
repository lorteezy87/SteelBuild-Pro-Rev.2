import { createContext, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export const ProjectContext = createContext({
  activeProject: null,
  setActiveProject: () => {},
  projects: [],
  loading: false,
});

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const data = await base44.entities.Project.list("-created_date");
        setProjects(data);

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
    <ProjectContext.Provider value={{ activeProject, setActiveProject: handleProjectSelect, projects, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}