import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  RotateCw,
  Save,
  Tag,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { resolveFileUrl } from "@/api/supabaseClient";
import {
  PHOTO_CATEGORIES,
  createPhotoEditPatch,
  formatPhotoDate,
  getPhotoCategoryColor,
  type PhotoEditPatch,
  type PhotoRecord,
} from "./PhotoGalleryDerive";

type PhotoLightboxProps = {
  photo: PhotoRecord;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onDelete: (id: string) => void;
  onSave: (id: string, patch: PhotoEditPatch) => void;
  deleting: boolean;
  saving: boolean;
};

export default function PhotoLightbox({
  photo,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onSave,
  deleting,
  saving,
}: PhotoLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PhotoEditPatch | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setEditing(false);
    setDraft(null);
    setImgLoading(true);
    let cancelled = false;
    resolveFileUrl(photo.file_url)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.id, photo.file_url]);

  const startEdit = () => {
    setDraft(createPhotoEditPatch(photo));
    setEditing(true);
  };

  const saveEdit = () => {
    if (!draft) return;
    onSave(photo.id, draft);
    setEditing(false);
  };

  const handleDownload = () => {
    try {
      if (!resolvedUrl) return;
      const anchor = document.createElement("a");
      anchor.href = resolvedUrl;
      anchor.download = photo.file_name || photo.title || "photo";
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      toast.error("Download failed");
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${photo.title || "this photo"}"? This cannot be undone.`)) {
      onDelete(photo.id);
    }
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const color = getPhotoCategoryColor(photo.category);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        zIndex: 2000,
      }}
      onClick={closeFromBackdrop}
    >
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
        onClick={closeFromBackdrop}
      >
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 5,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.08em",
            }}
          >
            {index + 1} / {total}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ToolbarButton onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} title="Zoom out">
              <ZoomOut size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={() => setZoom(1)} title="Reset zoom">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700 }}>
                {Math.round(zoom * 100)}%
              </span>
            </ToolbarButton>
            <ToolbarButton onClick={() => setZoom((value) => Math.min(4, value + 0.25))} title="Zoom in">
              <ZoomIn size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={() => setRotation((value) => (value + 90) % 360)} title="Rotate">
              <RotateCw size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={handleDownload} title="Download" disabled={!resolvedUrl}>
              <Download size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={onClose} title="Close (Esc)">
              <X size={14} />
            </ToolbarButton>
          </div>
        </div>

        {onPrev && (
          <button
            onClick={onPrev}
            style={navButtonStyle("left")}
            title="Previous (←)"
            aria-label="Previous photo"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            style={navButtonStyle("right")}
            title="Next (→)"
            aria-label="Next photo"
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
          }}
        >
          {!resolvedUrl ? (
            <div style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
              Loading…
            </div>
          ) : (
            <img
              src={resolvedUrl}
              alt={photo.title || photo.file_name || ""}
              onLoad={() => setImgLoading(false)}
              style={{
                maxWidth: zoom === 1 ? "100%" : "none",
                maxHeight: zoom === 1 ? "100%" : "none",
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: "transform 0.18s",
                cursor: zoom > 1 ? "move" : "default",
                display: "block",
                borderRadius: 4,
                opacity: imgLoading ? 0 : 1,
              }}
            />
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.08em",
            pointerEvents: "none",
          }}
        >
          ← → navigate · esc close · click outside to dismiss
        </div>
      </div>

      <aside
        style={{
          width: 360,
          maxWidth: "40vw",
          background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)",
          padding: 20,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            background: `${color}26`,
            border: `1px solid ${color}66`,
            borderRadius: 6,
            alignSelf: "flex-start",
          }}
        >
          <Tag size={10} color={color} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {photo.category}
          </span>
        </div>

        {!editing || !draft ? (
          <>
            <div>
              <FieldLabel>Title</FieldLabel>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                {photo.title || <em style={{ color: "var(--text-muted)" }}>Untitled</em>}
              </div>
            </div>

            {photo.description && (
              <div>
                <FieldLabel>Description</FieldLabel>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {photo.description}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <FieldLabel>Date taken</FieldLabel>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {formatPhotoDate(photo.taken_date)}
                </div>
              </div>
              {photo.location && (
                <div>
                  <FieldLabel>Location</FieldLabel>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{photo.location}</div>
                </div>
              )}
            </div>

            {photo.created_at && (
              <div>
                <FieldLabel>Uploaded</FieldLabel>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {new Date(photo.created_at).toLocaleString()}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
              <button onClick={startEdit} style={panelButtonStyle()}>
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={panelButtonStyle({ destructive: true, disabled: deleting })}
              >
                <Trash2 size={12} /> {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <FieldLabel>Title</FieldLabel>
              <input
                type="text"
                value={draft.title ?? ""}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                style={editInputStyle}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={draft.description ?? ""}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={4}
                style={{ ...editInputStyle, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  value={draft.category ?? "Other"}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  style={editInputStyle}
                >
                  {PHOTO_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Date taken</FieldLabel>
                <input
                  type="date"
                  value={draft.taken_date ?? ""}
                  onChange={(event) => setDraft({ ...draft, taken_date: event.target.value })}
                  style={editInputStyle}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input
                type="text"
                value={draft.location ?? ""}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                style={editInputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={panelButtonStyle({ primary: true, disabled: saving })}
              >
                <Save size={12} /> {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} style={panelButtonStyle()}>
                Cancel
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

type ToolbarButtonProps = {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
};

function ToolbarButton({ children, onClick, title, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 30,
        height: 30,
        padding: "0 8px",
        background: "rgba(15,23,42,0.78)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 6,
        color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
        cursor: disabled ? "not-allowed" : "pointer",
        backdropFilter: "blur(6px)",
        transition: "all 0.15s",
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.background = "rgba(30,41,59,0.9)";
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "rgba(15,23,42,0.78)";
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
      }}
    >
      {children}
    </button>
  );
}

function navButtonStyle(side: "left" | "right"): CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 16,
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    background: "rgba(15,23,42,0.78)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
    zIndex: 4,
  };
}

const editInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "7px 10px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

type PanelButtonOptions = {
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
};

function panelButtonStyle({
  primary = false,
  destructive = false,
  disabled = false,
}: PanelButtonOptions = {}): CSSProperties {
  return {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "8px 10px",
    borderRadius: 6,
    border: destructive
      ? "1px solid var(--status-error)"
      : primary
        ? "1px solid var(--accent)"
        : "1px solid var(--border-default)",
    background: destructive
      ? "rgba(239,68,68,0.12)"
      : primary
        ? "var(--accent)"
        : "var(--bg-surface)",
    color: destructive
      ? "var(--status-error)"
      : primary
        ? "var(--bg-base)"
        : "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: disabled ? 0.5 : 1,
  };
}
