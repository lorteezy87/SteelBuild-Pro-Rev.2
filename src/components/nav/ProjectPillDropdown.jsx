import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../shared/ProjectContext";

export default function ProjectPillDropdown({ compact = false }) {
  const { projects, activeProject, setActiveProject, loading } = useProjectContext();
  // Pages resolve the project id via useProjectId() which checks the URL
  // FIRST (?projectId= / ?project=), then falls back to the active project
  // in context. Without stripping those params on a switch, picking a new
  // project from the pill silently has no effect because the URL still
  // pins the page to the previous one. We clear them on every selection.
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  // Fetch RFI counts for quick stats when dropdown is open
  const { data: allRFIs = [] } = useQuery({
    queryKey: ["pill-rfis-quick"],
    queryFn: () => base44.entities.RFI.list(),
    enabled: open,
    staleTime: 60_000,
    initialData: [],
  });

  // Build per-project open RFI counts
  const rfiCountByProject = {};
  allRFIs.forEach((rfi) => {
    if (rfi.status === "Open" || rfi.status === "Under Review") {
      const pid = rfi.project_id;
      if (pid) rfiCountByProject[pid] = (rfiCountByProject[pid] || 0) + 1;
    }
  });

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!open) setSearch("");
  }, [open]);

  const handleSelect = useCallback(
    (p) => {
      setActiveProject(p);
      setOpen(false);
      setSearch("");
      // Drop URL-pinned project ids so useProjectId() falls back to
      // the new activeProject. `replace: true` keeps the back button
      // returning to wherever the user came from, not to the same URL
      // with the old `?project=` glued back on. We only mutate when at
      // least one of the params is actually present.
      if (searchParams.has("projectId") || searchParams.has("project")) {
        const next = new URLSearchParams(searchParams);
        next.delete("projectId");
        next.delete("project");
        setSearchParams(next, { replace: true });
      }
    },
    [setActiveProject, searchParams, setSearchParams]
  );

  const projectNameLimit = compact ? 14 : 20;
  const label =
    loading
      ? "Loading..."
      : activeProject
        ? `${activeProject.name.slice(0, 20)} · ${activeProject.project_number || "—"}`
        : projects.length === 0
          ? "NO PROJECTS"
          : "SELECT PROJECT";

  // Filter projects by search
  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.project_number || "").toLowerCase().includes(q)
    );
  });

  const sortAlpha = (arr) => [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const grouped = {
    active: sortAlpha(filtered.filter((p) => p.phase !== "Closeout")),
    closeout: sortAlpha(filtered.filter((p) => p.phase === "Closeout")),
  };

  return (
    <div
      ref={ref}
      className="project-pill-dropdown"
      data-compact={compact ? "true" : "false"}
      data-name-limit={projectNameLimit}
      style={{ position: "relative", minWidth: 0 }}
    >
      {/* Pill trigger */}
      <div
        className="project-pill-trigger"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          borderRadius: 20,
          minHeight: compact ? 34 : undefined,
          padding: compact ? "6px 10px" : "5px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--status-warning)",
          letterSpacing: "0.10em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s",
          userSelect: "none",
          maxWidth: compact ? "min(44vw, 190px)" : 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={label}
      >
        {activeProject && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                activeProject.health_status === "On Track"
                  ? "var(--status-success)"
                  : activeProject.health_status === "Watch"
                    ? "var(--status-warning)"
                    : "var(--status-error)",
              flexShrink: 0,
              boxShadow: "0 0 4px var(--warning-muted)",
            }}
          />
        )}
        {label}
        <span
          style={{
            marginLeft: 4,
            transition: "transform 0.15s",
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          className="project-pill-dropdown-panel sbd-card"
          style={{
            position: compact ? "fixed" : "absolute",
            top: compact ? 58 : "calc(100% + 6px)",
            right: compact ? 12 : 0,
            left: compact ? 12 : undefined,
            width: compact ? "auto" : 360,
            maxHeight: compact ? "min(70dvh, 420px)" : 300,
            overflowY: "auto",
            background: "linear-gradient(180deg, rgba(7, 13, 24, 0.995) 0%, rgba(4, 9, 18, 0.995) 100%)",
            border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border-default))",
            borderRadius: 14,
            boxShadow:
              "0 24px 70px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.07)",
            zIndex: 3000,
            padding: 8,
          }}
        >
          {/* Search filter */}
          <div style={{ marginBottom: 8 }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                background: "rgba(9, 18, 32, 1)",
                border: "1px solid var(--accent-border)",
                borderRadius: 6,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-default)")
              }
            />
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div
              style={{
                padding: "16px 12px",
                textAlign: "center",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {search ? "No matching projects" : "No projects yet"}
            </div>
          )}

          {/* Active projects */}
          {grouped.active.length > 0 && (
            <div>
              <div
                style={{
                  padding: "6px 8px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.16em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Active ({grouped.active.length})
              </div>
              {grouped.active.map((p) => (
                <ProjectOption
                  key={p.id}
                  project={p}
                  isActive={activeProject?.id === p.id}
                  openRFIs={rfiCountByProject[p.id] || 0}
                  onClick={() => handleSelect(p)}
                />
              ))}
            </div>
          )}

          {/* Closeout projects */}
          {grouped.closeout.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  padding: "6px 8px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.16em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Closeout ({grouped.closeout.length})
              </div>
              {grouped.closeout.map((p) => (
                <ProjectOption
                  key={p.id}
                  project={p}
                  isActive={activeProject?.id === p.id}
                  openRFIs={rfiCountByProject[p.id] || 0}
                  onClick={() => handleSelect(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Individual project row ── */
function ProjectOption({ project, isActive, openRFIs, onClick }) {
  const [hovered, setHovered] = useState(false);

  const healthColor =
    project.health_status === "On Track"
      ? "var(--status-success)"
      : project.health_status === "Watch"
        ? "var(--status-warning)"
        : project.health_status === "At Risk"
          ? "var(--status-error)"
          : "var(--text-muted)";

  const statusLabel =
    project.phase === "Closeout"
      ? "Complete"
      : project.phase
        ? "Active"
        : "Active";

  const statusColor =
    statusLabel === "Complete"
      ? "var(--status-success)"
      : "var(--accent, var(--status-info))";

  // Build quick-stat text
  let quickStat = null;
  if (project.health_status === "At Risk") {
    quickStat = { text: "At Risk", color: "var(--status-error)" };
  } else if (project.health_status === "Watch") {
    quickStat = { text: "Watch", color: "var(--status-warning)" };
  } else if (openRFIs > 0) {
    quickStat = {
      text: `${openRFIs} open RFI${openRFIs !== 1 ? "s" : ""}`,
      color: "var(--status-warning)",
    };
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        background: isActive
          ? "var(--accent-muted)"
          : hovered
            ? "rgba(86,176,255,0.12)"
            : "transparent",
        borderLeft: isActive
          ? "3px solid var(--accent)"
          : hovered
            ? "3px solid var(--border-default)"
            : "3px solid transparent",
        borderRadius: 6,
        transition: "all 0.1s",
        marginBottom: 2,
      }}
    >
      {/* Health indicator dot */}
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: healthColor,
          flexShrink: 0,
          boxShadow: `0 0 4px ${healthColor}88`,
        }}
      />

      {/* Project info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              color: "var(--text-primary)",
              fontWeight: isActive ? 600 : 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {project.name}
          </div>
          {/* Status badge */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.06em",
              color: statusColor,
              background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
              padding: "1px 6px",
              borderRadius: 4,
              flexShrink: 0,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent)",
              letterSpacing: "0.06em",
            }}
          >
            {project.project_number || "—"} · {project.phase || "—"}
          </span>
          {quickStat && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8.5,
                color: quickStat.color,
                letterSpacing: "0.04em",
                opacity: 0.85,
              }}
            >
              · {quickStat.text}
            </span>
          )}
        </div>
      </div>

      {/* Active checkmark */}
      {isActive && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <polyline points="11.5 3 5.5 9.5 2 6" />
        </svg>
      )}
    </div>
  );
}
