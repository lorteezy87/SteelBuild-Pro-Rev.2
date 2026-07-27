import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import PhotoUploadModal from "@/components/photos/PhotoUploadModal";
import PhotoGallery from "@/components/photos/PhotoGallery";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { Upload } from "lucide-react";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";

export default function Photos() {
  const projectId = useProjectId();
  const [showUpload, setShowUpload] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  // Auto-open the upload modal when QuickAddFAB navigated here with ?new=1.
  useAutoOpenCreate(() => setShowUpload(true));

  const {
    data: rawPhotos = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["photos", projectId],
    queryFn: () =>
      projectId
        ? entities.Photo.filter({ project_id: projectId })
        : entities.Photo.list("-taken_date"),
  });
  // Defensive soft-delete filter (matches DailyLogs / Procurement pattern).
  const photos = React.useMemo(() => rawPhotos.filter((r) => !r.is_deleted), [rawPhotos]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
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
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
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
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Project Photos"
        count={filtered.length}
        unit=" · PHOTOS"
        subtitle="Progress · safety · issues · delivery · punchlist · field documentation"
      >
        <Button variant="primary" onClick={() => setShowUpload(true)}>
          <Upload size={12} /> Upload Photo
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"     value={stats.total}    color="var(--accent)"
                 active={filterCategory === "all"} onClick={() => setFilterCategory("all")} />
        <KpiTile compact label="Progress"  value={stats.progress} color="var(--status-info)"
                 active={filterCategory === "Progress"} onClick={() => setFilterCategory(filterCategory === "Progress" ? "all" : "Progress")} />
        <KpiTile compact label="Safety"    value={stats.safety}   color="var(--status-error)"
                 active={filterCategory === "Safety"} onClick={() => setFilterCategory(filterCategory === "Safety" ? "all" : "Safety")} />
        <KpiTile compact label="Issues"    value={stats.issue}    color="var(--status-warning)"
                 active={filterCategory === "Issue"} onClick={() => setFilterCategory(filterCategory === "Issue" ? "all" : "Issue")} />
        <KpiTile compact label="Delivery"  value={stats.delivery} color="var(--status-success)"
                 active={filterCategory === "Delivery"} onClick={() => setFilterCategory(filterCategory === "Delivery" ? "all" : "Delivery")} />
        <KpiTile compact label="Punchlist" value={stats.punchlist} color="var(--phase-detailing)"
                 active={filterCategory === "Punchlist"} onClick={() => setFilterCategory(filterCategory === "Punchlist" ? "all" : "Punchlist")} />
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

      {/* Photo Gallery — gate loading/error so empty chrome does not flash */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : isError ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
        }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
            Couldn’t load photos
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
            {toUserErrorMessage(error, "Something went wrong. Try again.")}
          </p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <PhotoGallery photos={filtered} />
      )}
    </div>
  );
}
