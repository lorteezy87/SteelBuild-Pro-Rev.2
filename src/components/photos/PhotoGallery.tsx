import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import PhotoThumb from "./PhotoThumb";
import {
  derivePhotoSelection,
  deriveVisiblePhotos,
  formatPhotoDate,
  getPhotoCategoryColor,
  groupPhotosByMonth,
  type PhotoEditPatch,
  type PhotoRecord,
  type PhotoSort,
} from "./PhotoGalleryDerive";
import PhotoLightbox from "./PhotoLightbox";

type PhotoGalleryProps = {
  photos?: PhotoRecord[];
};

type PhotoUpdateVariables = {
  id: string;
  patch: PhotoEditPatch;
};

export default function PhotoGallery({ photos = [] }: PhotoGalleryProps) {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<PhotoSort>("date_desc");
  const [groupByMonth, setGroupByMonth] = useState(false);

  const sortedPhotos = useMemo(
    () => deriveVisiblePhotos(photos, searchTerm, sortBy),
    [photos, searchTerm, sortBy],
  );
  const groupedPhotos = useMemo(
    () => groupPhotosByMonth(sortedPhotos, groupByMonth),
    [sortedPhotos, groupByMonth],
  );
  const selection = useMemo(
    () => derivePhotoSelection(sortedPhotos, selectedIndex),
    [sortedPhotos, selectedIndex],
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await entities.Photo.update(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Photo deleted");
    },
    onError: (error) => toast.error(toUserErrorMessage(error, "Delete failed")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: PhotoUpdateVariables) => entities.Photo.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Photo updated");
    },
    onError: (error) => toast.error(toUserErrorMessage(error, "Update failed")),
  });

  const goPrevious = useCallback(() => {
    setSelectedIndex((index) => (index === null ? null : Math.max(0, index - 1)));
  }, []);
  const goNext = useCallback(() => {
    setSelectedIndex((index) =>
      index === null ? null : Math.min(sortedPhotos.length - 1, index + 1),
    );
  }, [sortedPhotos.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, goPrevious, goNext]);

  if (photos.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px dashed var(--border-default)",
          borderRadius: 12,
          padding: "80px 40px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.4 }}>📷</div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            margin: "0 0 6px",
          }}
        >
          No photos yet
        </p>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Click "Upload Photo" to capture progress, safety, deliveries, or issues
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <input
          type="text"
          placeholder="Search title, description, location…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 220,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "7px 11px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            outline: "none",
          }}
        />
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as PhotoSort)}
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "7px 9px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            outline: "none",
            letterSpacing: "0.04em",
          }}
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="title_asc">Title A→Z</option>
          <option value="category">By category</option>
        </select>
        <button
          onClick={() => setGroupByMonth((value) => !value)}
          style={{
            background: groupByMonth ? "var(--accent)" : "var(--bg-surface-low)",
            color: groupByMonth ? "var(--bg-base)" : "var(--text-secondary)",
            border: `1px solid ${groupByMonth ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: 6,
            padding: "7px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {groupByMonth ? "✓ Grouped" : "Group by month"}
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginLeft: "auto",
          }}
        >
          {sortedPhotos.length} of {photos.length}
        </span>
      </div>

      {sortedPhotos.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "var(--bg-surface)",
            border: "1px dashed var(--border-default)",
            borderRadius: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          No photos match your filters
        </div>
      ) : (
        groupedPhotos.map((group) => (
          <div key={group.key || "all"} style={{ marginBottom: groupByMonth ? 24 : 0 }}>
            {group.key && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                {group.key}{" "}
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                  · {group.items.length}
                </span>
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {group.items.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onClick={() => setSelectedIndex(sortedPhotos.indexOf(photo))}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {selection.currentPhoto && selectedIndex !== null && (
        <PhotoLightbox
          photo={selection.currentPhoto}
          index={selectedIndex}
          total={sortedPhotos.length}
          onClose={() => setSelectedIndex(null)}
          onPrev={selection.canGoPrevious ? goPrevious : null}
          onNext={selection.canGoNext ? goNext : null}
          onDelete={(id) => {
            deleteMutation.mutate(id, {
              onSuccess: () => {
                if (sortedPhotos.length === 1) setSelectedIndex(null);
                else if (selectedIndex >= sortedPhotos.length - 1) goPrevious();
              },
            });
          }}
          onSave={(id, patch) => updateMutation.mutate({ id, patch })}
          deleting={deleteMutation.isPending}
          saving={updateMutation.isPending}
        />
      )}
    </>
  );
}

type PhotoCardProps = {
  photo: PhotoRecord;
  onClick: () => void;
};

function PhotoCard({ photo, onClick }: PhotoCardProps) {
  const color = getPhotoCategoryColor(photo.category);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open ${photo.title || photo.file_name || "photo"}`}
      className="sbd-card sbd-card-hover"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.18s",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = color;
        event.currentTarget.style.transform = "translateY(-2px)";
        event.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = "var(--border-default)";
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          overflow: "hidden",
          background: "var(--bg-surface-low)",
          position: "relative",
        }}
      >
        <PhotoThumb
          fileUrl={photo.file_url}
          alt={photo.title || photo.file_name || ""}
          onLoad={undefined}
          onError={undefined}
        />
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "3px 7px",
            background: `${color}E0`,
            color: "white",
            borderRadius: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            backdropFilter: "blur(4px)",
          }}
        >
          {photo.category}
        </div>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {photo.title && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={photo.title}
          >
            {photo.title}
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Calendar size={10} />
            {formatPhotoDate(photo.taken_date)}
          </span>
          {photo.location && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "55%",
              }}
              title={photo.location}
            >
              <MapPin size={10} /> {photo.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
