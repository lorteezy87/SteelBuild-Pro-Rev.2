import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ActivityFeed from "../components/shared/ActivityFeed";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";

const DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

function getDateCutoff(range) {
  if (range === "all") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return today;
  const days = parseInt(range);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // The `activities` table stores columns in snake_case (entity_type,
  // performed_by, project_id). Earlier this page was reading the
  // Base44-style camelCase aliases (userName, entityType, projectId)
  // which never exist on Supabase rows — every filter silently
  // evaluated to true/empty and the feed looked broken. We now read
  // the real column names, keeping legacy fallbacks in case a future
  // seed switches back to camelCase.
  const uniqueUsers = useMemo(
    () => [...new Set(activities.map((a) => a.performed_by ?? a.userName).filter(Boolean))],
    [activities]
  );

  const uniqueEntities = useMemo(
    () => [...new Set(activities.map((a) => a.entity_type ?? a.entityType).filter(Boolean))],
    [activities]
  );

  const filtered = useMemo(() => {
    const dateCutoff = getDateCutoff(dateRange);
    return activities.filter((a) => {
      const pid = a.project_id ?? a.projectId;
      const user = a.performed_by ?? a.userName;
      const ent  = a.entity_type ?? a.entityType;
      const ts   = a.timestamp ?? a.created_at;
      const projectMatch = filterProject === "all" || pid === filterProject;
      const userMatch    = filterUser === "all"    || user === filterUser;
      const entityMatch  = filterEntity === "all"  || ent === filterEntity;
      const dateMatch    = !dateCutoff || (ts && new Date(ts) >= dateCutoff);
      return projectMatch && userMatch && entityMatch && dateMatch;
    });
  }, [activities, filterProject, filterUser, filterEntity, dateRange]);

  const hasActiveFilters = filterProject !== "all" || filterUser !== "all" || filterEntity !== "all" || dateRange !== "all";

  const handleClearFilters = () => {
    setFilterProject("all");
    setFilterUser("all");
    setFilterEntity("all");
    setDateRange("all");
  };

  const handleExportCSV = () => {
    const headers = ["Timestamp", "User", "Action", "Entity Type", "Entity", "Project", "Description"];
    const rows = filtered.map((a) => [
      // Same snake_case-first, camelCase-fallback pattern as the
      // filter block above so CSV export stays in sync with the feed.
      new Date(a.timestamp ?? a.created_at).toLocaleString(),
      a.performed_by ?? a.userName ?? "",
      a.action ?? "",
      a.entity_type ?? a.entityType ?? "",
      a.entity_name ?? a.entityName ?? "",
      a.project_name ?? a.projectName ?? "—",
      a.description ?? "—",
    ]);

    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-audit-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const selectTriggerClass = "bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
            Activity Log
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Audit trail of all project changes and activity
          </p>
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
              transition: "all 0.15s",
              marginTop: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            CLEAR FILTERS
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            PROJECT
          </label>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger style={{ borderRadius: 8 }} className={selectTriggerClass}>
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            USER
          </label>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger style={{ borderRadius: 8 }} className={selectTriggerClass}>
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            ENTITY TYPE
          </label>
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger style={{ borderRadius: 8 }} className={selectTriggerClass}>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueEntities.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            DATE RANGE
          </label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger style={{ borderRadius: 8 }} className={selectTriggerClass}>
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: filtered.length > 0 ? "var(--accent-glow)" : "var(--bg-surface)",
              border: "1px solid var(--accent-border)",
              borderRadius: 8,
              color: filtered.length > 0 ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: filtered.length > 0 ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              opacity: filtered.length > 0 ? 1 : 0.5,
            }}
            onMouseEnter={(e) => { if (filtered.length > 0) { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.opacity = "0.85"; } }}
            onMouseLeave={(e) => { if (filtered.length > 0) { e.currentTarget.style.background = "var(--accent-glow)"; e.currentTarget.style.opacity = "1"; } }}
          >
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 14, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
            TOTAL ACTIVITIES
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--accent)", marginTop: 6 }}>
            {activitiesLoading ? "—" : filtered.length}
          </div>
          {hasActiveFilters && activities.length !== filtered.length && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
              of {activities.length} total
            </div>
          )}
        </div>

        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 14, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
            UNIQUE USERS
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--status-success)", marginTop: 6 }}>
            {activitiesLoading ? "—" : uniqueUsers.length}
          </div>
        </div>

        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 14, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
            ENTITY TYPES
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--status-info)", marginTop: 6 }}>
            {activitiesLoading ? "—" : uniqueEntities.length}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div style={{ background: "var(--hover-bg)", borderRadius: 12, padding: 16, border: "1px solid var(--divider)" }}>
        {activitiesLoading ? (
          <LoadingSkeleton variant="table" rows={6} />
        ) : filtered.length === 0 && !hasActiveFilters ? (
          /* Rich empty state */
          <div style={{
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--accent-glow)",
              border: "1px solid var(--accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}>
                No activity recorded yet
              </div>
              <div style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--text-secondary)",
                maxWidth: 380,
                lineHeight: 1.5,
              }}>
                Activity will appear here as your team creates RFIs, uploads drawings,
                updates work packages, and makes changes across the project.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
              <button
                onClick={() => navigate(createPageUrl("RFIs"))}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent-glow)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: 8,
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-glow)"; }}
              >
                Create an RFI
              </button>
              <button
                onClick={() => navigate(createPageUrl("Documents"))}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                Upload a Drawing
              </button>
              <button
                onClick={() => navigate(createPageUrl("WorkPackages"))}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                Add Work Package
              </button>
            </div>
          </div>
        ) : filtered.length === 0 && hasActiveFilters ? (
          /* Filtered-to-zero state */
          <div style={{
            padding: "40px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}>
              No activity matches these filters
            </div>
            <button
              onClick={handleClearFilters}
              style={{
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid var(--accent-border)",
                borderRadius: 8,
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-glow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              CLEAR ALL FILTERS
            </button>
          </div>
        ) : (
          <ActivityFeed activities={filtered} />
        )}
      </div>
    </div>
  );
}
