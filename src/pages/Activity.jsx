import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ActivityFeed from "../components/shared/ActivityFeed";

export default function ActivityPage() {
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const uniqueUsers = useMemo(
    () => [...new Set(activities.map((a) => a.userName))],
    [activities]
  );

  const uniqueEntities = useMemo(
    () => [...new Set(activities.map((a) => a.entityType))],
    [activities]
  );

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      const projectMatch = filterProject === "all" || a.projectId === filterProject;
      const userMatch = filterUser === "all" || a.userName === filterUser;
      const entityMatch = filterEntity === "all" || a.entityType === filterEntity;
      return projectMatch && userMatch && entityMatch;
    });
  }, [activities, filterProject, filterUser, filterEntity]);

  const handleExportCSV = () => {
    const headers = ["Timestamp", "User", "Action", "Entity Type", "Entity", "Project", "Description"];
    const rows = filtered.map((a) => [
    new Date(a.timestamp).toLocaleString(),
    a.userName,
    a.action,
    a.entityType,
    a.entityName,
    a.projectName || "—",
    a.description || "—"]
    );

    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-audit-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Activity Log
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Audit trail of all project changes and activity
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            PROJECT
          </label>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger style={{ borderRadius: 8 }} className="bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) =>
              <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            USER
          </label>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger style={{ borderRadius: 8 }} className="bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map((u) =>
              <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            ENTITY TYPE
          </label>
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger style={{ borderRadius: 8 }} className="bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueEntities.map((e) =>
              <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={handleExportCSV}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "var(--accent-glow)",
              border: "1px solid var(--accent-border)",
              borderRadius: 8,
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.1s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-hover)";
              e.currentTarget.style.opacity = "0.8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent-glow)";
            }}>

            📥 EXPORT CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12
        }}>

        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 12, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            Total Activities
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>
            {filtered.length}
          </div>
        </div>

        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 12, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            Unique Users
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#00D68F", marginTop: 4 }}>
            {uniqueUsers.length}
          </div>
        </div>

        <div style={{ background: "var(--hover-bg)", borderRadius: 10, padding: 12, border: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            Entity Types
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#00B8D9", marginTop: 4 }}>
            {uniqueEntities.length}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div style={{ background: "var(--hover-bg)", borderRadius: 12, padding: 16, border: "1px solid var(--divider)" }}>
        <ActivityFeed activities={filtered} />
      </div>
    </div>);

}