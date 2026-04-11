import React, { useState, useEffect, useRef } from "react";
import { useProjectContext } from "../shared/useProjectContext";

export default function ProjectPillDropdown() {
  const { projects, activeProject, setActiveProject, loading } = useProjectContext();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const label =
    loading ? "Loading..." :
    activeProject ? `${activeProject.name.slice(0, 20)} · ${activeProject.project_number || "—"}` :
    projects.length === 0 ? "NO PROJECTS" :
    "SELECT PROJECT";

  const grouped = {
    active: projects.filter(p => p.phase !== "Closeout"),
    closeout: projects.filter(p => p.phase === "Closeout")
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          borderRadius: 20,
          padding: "5px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--status-warning)",
          letterSpacing: "0.10em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s",
          userSelect: "none",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
        title={label}
      >
        {activeProject && (
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background:
              activeProject.health_status === "On Track" ? "var(--status-success)" :
              activeProject.health_status === "Watch" ? "var(--status-warning)" : "var(--status-error)",
            flexShrink: 0,
            boxShadow: `0 0 4px var(--warning-muted)`
          }} />
        )}
        {label}
        <span style={{ marginLeft: 4 }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            top: "52px",
            right: "16px",
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            boxShadow: "0 20px 50px rgba(0,0,0,0.7)",
            zIndex: 2000
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 12px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--text-muted)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              borderBottom: "1px solid var(--divider)"
            }}
          >
            Switch Project
          </div>

          {/* Empty state */}
          {projects.length === 0 && (
            <div
              style={{
                padding: "16px 12px",
                textAlign: "center",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--text-muted)"
              }}
            >
              No projects yet
            </div>
          )}

          {/* Active projects */}
          {grouped.active.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  letterSpacing: "0.18em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase"
                }}
              >
                Active
              </div>
              <div style={{ padding: 8 }}>
                {grouped.active.map((p) => (
                  <ProjectOption
                    key={p.id}
                    project={p}
                    isActive={activeProject?.id === p.id}
                    onClick={() => {
                      setActiveProject(p);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Closeout projects */}
          {grouped.closeout.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  letterSpacing: "0.18em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase"
                }}
              >
                Closeout
              </div>
              <div style={{ padding: 8 }}>
                {grouped.closeout.map((p) => (
                  <ProjectOption
                    key={p.id}
                    project={p}
                    isActive={activeProject?.id === p.id}
                    onClick={() => {
                      setActiveProject(p);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectOption({ project, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  const healthColor =
    project.health_status === "On Track" ? "var(--status-success)" :
    project.health_status === "Watch" ? "var(--status-warning)" :
    project.health_status === "At Risk" ? "var(--status-error)" : "var(--text-muted)";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        background: isActive ? "var(--accent-muted)" : hovered ? "var(--bg-hover)" : "transparent",
        borderLeft: isActive || hovered ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: 8,
        transition: "all 0.1s",
        marginBottom: 4
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: healthColor,
          flexShrink: 0,
          boxShadow: `0 0 4px ${healthColor}88`
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-primary)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {project.name}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            letterSpacing: "0.06em",
            marginTop: 2
          }}
        >
          {project.project_number} · {project.phase || "—"}
        </div>
      </div>
      {isActive && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="11.5 3 5.5 9.5 2 6" />
        </svg>
      )}
    </div>
  );
}