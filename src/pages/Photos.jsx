import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import PhotoUploadModal from "@/components/photos/PhotoUploadModal";
import PhotoGallery from "@/components/photos/PhotoGallery";

export default function Photos() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showUpload, setShowUpload] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  const { data: photos = [] } = useQuery({
    queryKey: ["photos", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Photo.filter({ project_id: projectId })
        : base44.entities.Photo.list("-taken_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  // Date filtering logic
  const getFilteredByDate = () => {
    if (filterDate === "all") return photos;
    const now = new Date();
    const ranges = {
      today: 1,
      week: 7,
      month: 30,
    };
    const days = ranges[filterDate] || 0;
    const cutoff = new Date(now.setDate(now.getDate() - days));
    return photos.filter((p) => new Date(p.taken_date) >= cutoff);
  };

  const filtered = getFilteredByDate().filter((p) => {
    const categoryMatch = filterCategory === "all" || p.category === filterCategory;
    return categoryMatch;
  });

  const stats = {
    total: photos.length,
    progress: photos.filter((p) => p.category === "Progress").length,
    safety: photos.filter((p) => p.category === "Safety").length,
    issue: photos.filter((p) => p.category === "Issue").length,
    delivery: photos.filter((p) => p.category === "Delivery").length,
    punchlist: photos.filter((p) => p.category === "Punchlist").length,
    other: photos.filter((p) => p.category === "Other").length,
  };

  const categories = ["Progress", "Safety", "Issue", "Delivery", "Punchlist", "Other"];
  const dateRanges = [
    { label: "All Time", value: "all" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "Today", value: "today" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Project Photos
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginTop: 4,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {selectedProject ? selectedProject.name : "All Projects"} • {filtered.length} Photos
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            fontFamily: "var(--font-body)",
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          + Upload Photo
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" />
        <StatCard label="Progress" value={stats.progress} color="var(--status-info)" />
        <StatCard label="Safety" value={stats.safety} color="var(--status-error)" />
        <StatCard label="Issues" value={stats.issue} color="var(--status-warning)" />
        <StatCard label="Delivery" value={stats.delivery} color="var(--status-success)" />
        <StatCard label="Punchlist" value={stats.punchlist} color="var(--accent)" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {/* Category Filter */}
        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Category:
          </span>
          {["all", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                background: filterCategory === cat ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterCategory === cat ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>

        {/* Date Range Filter */}
        <div style={{ display: "flex", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            When:
          </span>
          {dateRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => setFilterDate(range.value)}
              style={{
                background: filterDate === range.value ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterDate === range.value ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <PhotoUploadModal projectId={projectId} onClose={() => setShowUpload(false)} />
      )}

      {/* Photo Gallery */}
      <PhotoGallery photos={filtered} />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-card)",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "18px",
          fontWeight: 600,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "8px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}