import { useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import {
  defaultPhotoUploadDate,
  totalPhotoUploadBytes,
  type PhotoCategory,
} from "./PhotoUploadDerive";
import {
  PhotoUploadDropZone,
  PhotoUploadFooter,
  PhotoUploadGlobalControls,
  PhotoUploadItemRow,
  type PhotoFileInputChangeEvent,
} from "./PhotoUploadParts";
import { usePhotoUploadItems } from "./usePhotoUploadItems";
import { usePhotoUploadOrchestration } from "./usePhotoUploadOrchestration";

type PhotoUploadModalProps = {
  projectId?: string | null;
  onClose: () => void;
};

export default function PhotoUploadModal({ projectId, onClose }: PhotoUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [globalCategory, setGlobalCategory] = useState<PhotoCategory>("Progress");
  const [globalProjectId, setGlobalProjectId] = useState(projectId || "");
  const [globalLocation, setGlobalLocation] = useState("");
  const [globalDate, setGlobalDate] = useState(defaultPhotoUploadDate);
  const [isDragging, setIsDragging] = useState(false);
  const { items, addFiles, updateItem, removeItem, applyToAll } = usePhotoUploadItems();
  const { upload, isUploading, progress } = usePhotoUploadOrchestration({
    items,
    projectId: globalProjectId,
    updateItem,
    onClose,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const defaults = {
    category: globalCategory,
    location: globalLocation,
    takenDate: globalDate,
  };

  const handleFileChange = (event: PhotoFileInputChangeEvent) => {
    if (event.target.files) void addFiles(event.target.files, defaults);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer?.files) void addFiles(event.dataTransfer.files, defaults);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === dropZoneRef.current) setIsDragging(false);
  };

  const projectName = projects.find((project) => project.id === globalProjectId)?.name;
  const totalMegabytes = (totalPhotoUploadBytes(items) / (1024 * 1024)).toFixed(1);
  const canUpload = !isUploading && items.length > 0 && Boolean(globalProjectId);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isUploading) onClose();
      }}
    >
      <div
        className="sbd-card-strong"
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 16,
          maxWidth: 920,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              Upload Photos
            </h2>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                marginTop: 4,
              }}
            >
              {items.length === 0
                ? "Drag photos here or click to select"
                : `${items.length} photo${items.length === 1 ? "" : "s"} ready · ${totalMegabytes} MB total`}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: isUploading ? "not-allowed" : "pointer",
              minWidth: 40,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <PhotoUploadGlobalControls
            projects={projects}
            projectId={globalProjectId}
            category={globalCategory}
            date={globalDate}
            location={globalLocation}
            disabled={isUploading}
            onProjectChange={setGlobalProjectId}
            onCategoryChange={(category) => {
              setGlobalCategory(category);
              applyToAll("category", category);
            }}
            onDateChange={setGlobalDate}
            onLocationChange={setGlobalLocation}
            onLocationBlur={(location) => applyToAll("location", location)}
          />

          <PhotoUploadDropZone
            hasItems={items.length > 0}
            isDragging={isDragging}
            dropZoneRef={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onSelect={() => fileInputRef.current?.click()}
          />

          {items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((item) => (
                <PhotoUploadItemRow
                  key={item.id}
                  item={item}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  disabled={isUploading}
                />
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        <PhotoUploadFooter
          isUploading={isUploading}
          progress={progress}
          projectName={projectName}
          itemCount={items.length}
          canUpload={canUpload}
          onClose={onClose}
          onUpload={upload}
        />
      </div>
    </div>
  );
}
