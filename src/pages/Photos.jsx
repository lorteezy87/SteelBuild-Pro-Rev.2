import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import {
  filterLiveRecords,
  filterPhotos,
  computePhotoStats,
  nextFilterToggle,
  PHOTOS_COMMAND_SUBTITLE,
} from "./photos/photosPageHelpers";
import {
  PhotosKpiStrip,
  PhotosFilterBar,
  PhotosLoadError,
} from "./photos/PhotosUi";
import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import PhotoUploadModal from "@/components/photos/PhotoUploadModal";
import PhotoGallery from "@/components/photos/PhotoGallery";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, Button } from "@/components/design-system";
import { Upload } from "lucide-react";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";

import { findById } from "@/pages/shared/findById";
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
  const photos = React.useMemo(() => filterLiveRecords(rawPhotos), [rawPhotos]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = findById(projects, projectId);

  const filtered = filterPhotos(photos, { filterDate, filterCategory });
  const stats = computePhotoStats(photos);

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
        subtitle={PHOTOS_COMMAND_SUBTITLE}
      >
        <Button variant="primary" onClick={() => setShowUpload(true)}>
          <Upload size={12} /> Upload Photo
        </Button>
      </CommandBar>

      <PhotosKpiStrip
        stats={stats}
        filterCategory={filterCategory}
        onToggleCategory={(cat) => setFilterCategory(nextFilterToggle(filterCategory, cat))}
      />

      <PhotosFilterBar
        filterCategory={filterCategory}
        filterDate={filterDate}
        onFilterCategory={setFilterCategory}
        onFilterDate={setFilterDate}
      />

      {showUpload && (
        <PhotoUploadModal projectId={projectId} onClose={() => setShowUpload(false)} />
      )}

      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : isError ? (
        <PhotosLoadError
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
        />
      ) : (
        <PhotoGallery photos={filtered} />
      )}
    </div>
  );
}
