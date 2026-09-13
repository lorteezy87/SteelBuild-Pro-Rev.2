import type {
  CSSProperties,
  ChangeEvent,
  DragEvent,
  MutableRefObject,
  ReactNode,
} from "react";
import { AlertCircle, Camera, Check, Trash2, Upload } from "lucide-react";
import {
  MAX_PHOTO_UPLOAD_FILES,
  PHOTO_CATEGORIES,
  type PhotoCategory,
  type PhotoProject,
  type PhotoUploadItem,
  type PhotoUploadItemPatch,
  type PhotoUploadProgress,
} from "./PhotoUploadDerive";

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "6px 9px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  outline: "none",
  boxSizing: "border-box",
};

const compactInputStyle: CSSProperties = {
  ...inputStyle,
  fontSize: 10,
  padding: "5px 7px",
};

function Label({ children }: { children: ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 3,
      }}
    >
      {children}
    </label>
  );
}

type GlobalControlsProps = {
  projects: readonly PhotoProject[];
  projectId: string;
  category: PhotoCategory;
  date: string;
  location: string;
  disabled: boolean;
  onProjectChange: (value: string) => void;
  onCategoryChange: (value: PhotoCategory) => void;
  onDateChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onLocationBlur: (value: string) => void;
};

export function PhotoUploadGlobalControls({
  projects,
  projectId,
  category,
  date,
  location,
  disabled,
  onProjectChange,
  onCategoryChange,
  onDateChange,
  onLocationChange,
  onLocationBlur,
}: GlobalControlsProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <div>
        <Label>Project</Label>
        <select
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
          style={inputStyle}
          disabled={disabled}
        >
          <option value="">Select project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Default Category</Label>
        <select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as PhotoCategory)}
          style={inputStyle}
          disabled={disabled}
        >
          {PHOTO_CATEGORIES.map((photoCategory) => (
            <option key={photoCategory} value={photoCategory}>
              {photoCategory}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Default Date</Label>
        <input
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          style={inputStyle}
          disabled={disabled}
        />
      </div>
      <div>
        <Label>Default Location</Label>
        <input
          type="text"
          value={location}
          onChange={(event) => onLocationChange(event.target.value)}
          onBlur={(event) => onLocationBlur(event.target.value)}
          placeholder="e.g. North wing"
          style={inputStyle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

type DropZoneProps = {
  hasItems: boolean;
  isDragging: boolean;
  dropZoneRef: MutableRefObject<HTMLDivElement | null>;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onSelect: () => void;
};

export function PhotoUploadDropZone({
  hasItems,
  isDragging,
  dropZoneRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onSelect,
}: DropZoneProps) {
  if (hasItems) {
    return (
      <div
        ref={dropZoneRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onSelect}
        style={{
          background: isDragging ? "var(--accent-muted)" : "var(--bg-input)",
          border: `1px dashed ${isDragging ? "var(--accent)" : "var(--border-default)"}`,
          borderRadius: 8,
          padding: "12px 16px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 14,
          transition: "all 0.15s",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          + Add more photos (drop or click)
        </span>
      </div>
    );
  }

  return (
    <div
      ref={dropZoneRef}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onSelect}
      style={{
        background: isDragging ? "var(--accent-muted)" : "var(--bg-input)",
        border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-default)"}`,
        borderRadius: 12,
        padding: "60px 24px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <Camera size={36} color="var(--text-muted)" style={{ marginBottom: 12 }} />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          marginBottom: 6,
        }}
      >
        Drop photos here or click to select
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        JPEG, PNG, HEIC, WebP — up to {MAX_PHOTO_UPLOAD_FILES} at once · auto-compressed for
        upload
      </div>
    </div>
  );
}

type ItemRowProps = {
  item: PhotoUploadItem;
  onChange: (patch: PhotoUploadItemPatch) => void;
  onRemove: () => void;
  disabled: boolean;
};

export function PhotoUploadItemRow({ item, onChange, onRemove, disabled }: ItemRowProps) {
  const statusColor =
    item.status === "done"
      ? "var(--status-success)"
      : item.status === "error"
        ? "var(--status-error)"
        : item.status === "uploading"
          ? "var(--accent)"
          : "var(--border-default)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr auto",
        gap: 12,
        background: "var(--bg-surface)",
        border: `1px solid ${statusColor}`,
        borderRadius: 8,
        padding: 10,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--bg-surface-low)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <img
          src={item.preview}
          alt={item.title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {item.status === "done" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(34,197,94,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={28} color="white" />
          </div>
        )}
        {item.status === "error" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(239,68,68,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={28} color="white" />
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 6 }}>
        <input
          type="text"
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Title"
          style={compactInputStyle}
          disabled={disabled}
        />
        <select
          value={item.category}
          onChange={(event) => onChange({ category: event.target.value as PhotoCategory })}
          style={compactInputStyle}
          disabled={disabled}
        >
          {PHOTO_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={item.taken_date}
          onChange={(event) => onChange({ taken_date: event.target.value })}
          style={compactInputStyle}
          disabled={disabled}
        />
        <input
          type="text"
          value={item.location}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Location"
          style={compactInputStyle}
          disabled={disabled}
        />
        <textarea
          value={item.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Description (optional)"
          rows={1}
          style={{
            ...compactInputStyle,
            gridColumn: "1 / -1",
            resize: "vertical",
            minHeight: 28,
          }}
          disabled={disabled}
        />
        {item.error && (
          <div
            style={{
              gridColumn: "1 / -1",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-error)",
            }}
          >
            {item.error}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove photo"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          minWidth: 40,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4,
        }}
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function cancelButtonStyle(disabled: boolean): CSSProperties {
  return {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "8px 14px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
  };
}

function uploadButtonStyle(disabled: boolean): CSSProperties {
  return {
    background: "var(--accent)",
    color: "var(--bg-base)",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

type FooterProps = {
  isUploading: boolean;
  progress: PhotoUploadProgress;
  projectName: string | null | undefined;
  itemCount: number;
  canUpload: boolean;
  onClose: () => void;
  onUpload: () => void;
};

export function PhotoUploadFooter({
  isUploading,
  progress,
  projectName,
  itemCount,
  canUpload,
  onClose,
  onUpload,
}: FooterProps) {
  return (
    <div
      style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--border-default)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      {isUploading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              background: "var(--bg-surface)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(progress.done / progress.total) * 100}%`,
                background: "var(--accent)",
                transition: "width 0.2s",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            {progress.done} / {progress.total}
          </span>
        </div>
      ) : (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
          }}
        >
          {projectName ? `→ ${projectName}` : "Select a project to upload"}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isUploading}
          style={cancelButtonStyle(isUploading)}
        >
          {isUploading ? "Uploading…" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={!canUpload}
          style={uploadButtonStyle(!canUpload)}
        >
          <Upload size={12} />
          {isUploading
            ? "Uploading…"
            : `Upload ${itemCount || ""} Photo${itemCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export type PhotoFileInputChangeEvent = ChangeEvent<HTMLInputElement>;
