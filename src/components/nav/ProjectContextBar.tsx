import type { ReactNode } from "react";
import "@/styles/app-shell-system.css";

export interface ProjectContext {
  name?: string | null;
  project_number?: string | null;
  phase?: string | null;
  status?: string | null;
}

export interface ProjectContextBarProps {
  project?: ProjectContext | null;
  showProjectNumber?: boolean;
  projectSwitcher?: ReactNode;
  controls?: ReactNode;
}

export function ProjectContextBar({
  project,
  showProjectNumber = false,
  projectSwitcher,
  controls,
}: ProjectContextBarProps) {
  const projectName = project?.name?.trim() || "Portfolio";
  const phase = project?.phase?.trim() || project?.status?.trim() || null;

  return (
    <div className="sbp-project-context" aria-label="Project context">
      <div className="sbp-project-context__identity">
        <span className="sbp-project-context__label">Active project</span>
        <span className="sbp-project-context__name">{projectName}</span>
        {showProjectNumber && project?.project_number ? (
          <span className="sbp-project-context__number" data-testid="project-number">
            {project.project_number}
          </span>
        ) : null}
        {phase ? <span className="sbp-project-context__phase">{phase}</span> : null}
        {projectSwitcher ? <span className="sbp-project-context__switcher">{projectSwitcher}</span> : null}
      </div>
      {controls ? <div className="sbp-project-context__controls">{controls}</div> : null}
    </div>
  );
}

export default ProjectContextBar;
