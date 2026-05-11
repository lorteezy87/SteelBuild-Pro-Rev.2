import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { PAGE_LABELS } from "@/config/moduleRegistry";
import { useProjectContext } from "@/components/shared/ProjectContext";

export default function Breadcrumbs({ currentPageName }) {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const label = PAGE_LABELS[currentPageName] || currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Page";

  return (
    <div style={{
      padding: "6px 20px",
      background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)",
      display: "flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-mono)", fontSize: 10,
      letterSpacing: "0.06em", minHeight: 28,
    }}>
      <span
        onClick={() => navigate(createPageUrl("Dashboard"))}
        style={{ color: "var(--text-muted)", cursor: "pointer", transition: "color 0.1s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        Projects
      </span>
      {activeProject && (
        <>
          <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>/</span>
          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
            {activeProject.project_name || activeProject.name || "Project"}
          </span>
        </>
      )}
      <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>/</span>
      <span style={{ color: "var(--accent)", fontWeight: 700 }}>{label}</span>
    </div>
  );
}
