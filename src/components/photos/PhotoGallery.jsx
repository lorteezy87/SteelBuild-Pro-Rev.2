import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { toast } from "sonner";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Edit3,
  MapPin,
  Calendar,
  Tag,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Save,
} from "lucide-react";
import PhotoThumb from "./PhotoThumb";

const CATEGORY_COLORS = {
  Progress: "var(--status-info)",
  Safety: "var(--status-error)",
  Issue: "var(--status-warning)",
  Delivery: "var(--status-success)",
  Punchlist: "var(--accent)",
  Other: "var(--text-muted)",
};

const CATEGORIES = ["Progress", "Safety", "Issue", "Delivery", "Punchlist", "Other"];

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatGroupKey(d) {
  if (!d) return "Unknown";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export default function PhotoGallery({ photos = [] }) {
  const qc = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [groupByMonth, setGroupByMonth] = useState(false);

  // ── Filter + sort ──
  const sortedPhotos = useMemo(() => {
    const filtered = searchTerm.trim()
      ? photos.filter((p) => {
          const hay = `${p.title || ""} ${p.description || ""} ${p.location || ""} ${p.category || ""}`.toLowerCase();
          return hay.includes(searchTerm.toLowerCase());
        })
      : photos;

    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === "date_desc")
        return new Date(b.taken_date || 0) - new Date(a.taken_date || 0);
      if (sortBy === "date_asc")
        return new Date(a.taken_date || 0) - new Date(b.taken_date || 0);
      if (sortBy === "title_asc")
        return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "category")
        return (a.category || "").localeCompare(b.category || "");
      return 0;
    });
    return arr;
  }, [photos, searchTerm, sortBy]);

  // ── Group photos by month if grouping is on ──
  const groupedPhotos = useMemo(() => {
    if (!groupByMonth) return [{ key: null, items: sortedPhotos }];
    const groups = new Map();
    for (const p of sortedPhotos) {
      const key = formatGroupKey(p.taken_date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return Array.from(groups, ([key, items]) => ({ key, items }));
  }, [sortedPhotos, groupByMonth]);

  // ── Mutations ──
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Photo.update(id, { is_deleted: true, deleted_at: new Date().toISOString() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Photo deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }) => base44.entities.Photo.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Photo updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const goPrev = useCallback(() => {
    setSelectedIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  }, []);
  const goNext = useCallback(() => {
    setSelectedIndex((i) =>
      i === null ? null : Math.min(sortedPhotos.length - 1, i + 1)
    );
  }, [sortedPhotos.length]);

  // Keyboard nav
  useEffect(() => {
    if (selectedIndex === null) return;
    const handler = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIndex, goPrev, goNext]);

  // Empty state
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
        <div
          style={{
            fontSize: 48,
            marginBottom: 14,
            opacity: 0.4,
          }}
        >
          📷
        </div>
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

  const currentPhoto = selectedIndex !== null ? sortedPhotos[selectedIndex] : null;

  return (
    <>
      {/* Toolbar */}
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
          onChange={(e) => setSearchTerm(e.target.value)}
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
          onChange={(e) => setSortBy(e.target.value)}
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
          onClick={() => setGroupByMonth((v) => !v)}
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

      {/* Gallery */}
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
                {group.key} <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {group.items.length}</span>
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {group.items.map((photo) => {
                const indexInSorted = sortedPhotos.indexOf(photo);
                return (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onClick={() => setSelectedIndex(indexInSorted)}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Lightbox */}
      {currentPhoto && (
        <Lightbox
          photo={currentPhoto}
          index={selectedIndex}
          total={sortedPhotos.length}
          onClose={() => setSelectedIndex(null)}
          onPrev={selectedIndex > 0 ? goPrev : null}
          onNext={selectedIndex < sortedPhotos.length - 1 ? goNext : null}
          onDelete={(id) => {
            deleteMutation.mutate(id, {
              onSuccess: () => {
                if (sortedPhotos.length === 1) setSelectedIndex(null);
                else if (selectedIndex >= sortedPhotos.length - 1) goPrev();
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

// ───────────────────────────────────────────────────────────────────────────
function PhotoCard({ photo, onClick }) {
  const color = CATEGORY_COLORS[photo.category] || CATEGORY_COLORS.Other;
  return (
    <div
      onClick={onClick}
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
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.35)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
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
        <PhotoThumb fileUrl={photo.file_url} alt={photo.title || photo.file_name} />
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
            {formatDate(photo.taken_date)}
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

// ───────────────────────────────────────────────────────────────────────────
function Lightbox({
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
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);

  // Reset state on photo change
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
    setDraft({
      title: photo.title || "",
      description: photo.description || "",
      location: photo.location || "",
      category: photo.category || "Other",
      taken_date: photo.taken_date ? photo.taken_date.split("T")[0] : "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!draft) return;
    onSave(photo.id, draft);
    setEditing(false);
  };

  const handleDownload = async () => {
    try {
      if (!resolvedUrl) return;
      const a = document.createElement("a");
      a.href = resolvedUrl;
      a.download = photo.file_name || photo.title || "photo";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error("Download failed");
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${photo.title || "this photo"}"? This cannot be undone.`)) {
      onDelete(photo.id);
    }
  };

  const color = CATEGORY_COLORS[photo.category] || CATEGORY_COLORS.Other;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Image area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Top toolbar */}
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
            <ToolbarBtn onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="Zoom out">
              <ZoomOut size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => setZoom(1)} title="Reset zoom">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700 }}>
                {Math.round(zoom * 100)}%
              </span>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => setZoom((z) => Math.min(4, z + 0.25))} title="Zoom in">
              <ZoomIn size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
              <RotateCw size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={handleDownload} title="Download" disabled={!resolvedUrl}>
              <Download size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={onClose} title="Close (Esc)">
              <X size={14} />
            </ToolbarBtn>
          </div>
        </div>

        {/* Prev/Next buttons */}
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

        {/* Image */}
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
              alt={photo.title || photo.file_name}
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

        {/* Bottom hint */}
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

      {/* Side panel */}
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

        {!editing ? (
          <>
            <div>
              <FieldLabel>Title</FieldLabel>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
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
                  {formatDate(photo.taken_date)}
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
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                style={editInputStyle}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={4}
                style={{ ...editInputStyle, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  style={editInputStyle}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Date taken</FieldLabel>
                <input
                  type="date"
                  value={draft.taken_date}
                  onChange={(e) => setDraft({ ...draft, taken_date: e.target.value })}
                  style={editInputStyle}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input
                type="text"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
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

// ───────────────────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
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

function ToolbarBtn({ children, onClick, title, disabled }) {
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
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "rgba(30,41,59,0.9)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(15,23,42,0.78)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
      }}
    >
      {children}
    </button>
  );
}

function navButtonStyle(side) {
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

const editInputStyle = {
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

function panelButtonStyle({ primary, destructive, disabled } = {}) {
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
