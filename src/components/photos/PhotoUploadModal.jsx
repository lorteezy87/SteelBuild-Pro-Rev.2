import React, { useState, useRef, useEffect, useCallback } from "react";
import { entities, integrations } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Camera, Trash2, Check, AlertCircle } from "lucide-react";

const CATEGORIES = ["Progress", "Safety", "Issue", "Delivery", "Punchlist", "Other"];
const MAX_DIMENSION = 2400;
const COMPRESS_QUALITY = 0.86;
const MAX_FILES = 25;

// ── Image compression: scale down very large photos and re-encode as JPEG ──
async function compressImage(file) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 1024 * 1024) return file; // skip files under 1MB

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    const { width, height } = img;
    const longest = Math.max(width, height);
    if (longest <= MAX_DIMENSION) return file;

    const scale = MAX_DIMENSION / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY)
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

// ── EXIF date extraction (DateTimeOriginal preferred) ──
async function extractExifDate(file) {
  if (!file.type.startsWith("image/jpeg") && !file.type.startsWith("image/jpg")) {
    return null;
  }
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xffe1) {
        const size = view.getUint16(offset);
        if (view.getUint32(offset + 2) !== 0x45786966) return null;
        const tiffStart = offset + 8;
        const little = view.getUint16(tiffStart) === 0x4949;
        const get16 = (o) => view.getUint16(o, little);
        const get32 = (o) => view.getUint32(o, little);
        const ifd0 = tiffStart + get32(tiffStart + 4);
        const numEntries = get16(ifd0);
        let exifIfd = null;
        for (let i = 0; i < numEntries; i++) {
          const entry = ifd0 + 2 + i * 12;
          if (get16(entry) === 0x8769) {
            exifIfd = tiffStart + get32(entry + 8);
            break;
          }
        }
        if (!exifIfd) return null;
        const exifEntries = get16(exifIfd);
        for (let i = 0; i < exifEntries; i++) {
          const entry = exifIfd + 2 + i * 12;
          const tag = get16(entry);
          if (tag === 0x9003 || tag === 0x9004) {
            const stringOffset = tiffStart + get32(entry + 8);
            const bytes = [];
            for (let j = 0; j < 19; j++) bytes.push(view.getUint8(stringOffset + j));
            const dateStr = String.fromCharCode(...bytes);
            const match = dateStr.match(/^(\d{4}):(\d{2}):(\d{2})/);
            if (match) return `${match[1]}-${match[2]}-${match[3]}`;
          }
        }
        offset += size;
      } else if ((marker & 0xff00) === 0xff00) {
        offset += view.getUint16(offset);
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function makePreview(file) {
  return URL.createObjectURL(file);
}

export default function PhotoUploadModal({ projectId, onClose }) {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const [items, setItems] = useState([]); // { id, file, preview, title, description, location, category, taken_date, status }
  const [globalCategory, setGlobalCategory] = useState("Progress");
  const [globalProjectId, setGlobalProjectId] = useState(projectId || "");
  const [globalLocation, setGlobalLocation] = useState("");
  const [globalDate, setGlobalDate] = useState(new Date().toISOString().split("T")[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
    };
  }, [items]);

  const addFiles = useCallback(
    async (fileList) => {
      const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (incoming.length === 0) {
        toast.error("Only image files are supported");
        return;
      }
      const room = MAX_FILES - items.length;
      if (room <= 0) {
        toast.error(`Max ${MAX_FILES} photos per upload`);
        return;
      }
      const accepted = incoming.slice(0, room);
      if (incoming.length > accepted.length) {
        toast.warning(`Only ${room} more photos can be added`);
      }

      const newItems = await Promise.all(
        accepted.map(async (file) => {
          const exifDate = await extractExifDate(file);
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            preview: makePreview(file),
            title: file.name.replace(/\.[^.]+$/, ""),
            description: "",
            location: globalLocation,
            category: globalCategory,
            taken_date: exifDate || globalDate,
            status: "pending", // pending | uploading | done | error
            error: null,
          };
        })
      );
      setItems((prev) => [...prev, ...newItems]);
    },
    [items.length, globalCategory, globalDate, globalLocation]
  );

  const handleFileChange = (e) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZoneRef.current) setIsDragging(false);
  };

  const updateItem = (id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const applyToAll = (field, value) => {
    setItems((prev) => prev.map((it) => ({ ...it, [field]: value })));
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("No photos selected");
      if (!globalProjectId) throw new Error("Select a project");

      setUploadProgress({ done: 0, total: items.length });
      const errors = [];
      let done = 0;

      for (const item of items) {
        if (item.status === "done") {
          done++;
          setUploadProgress({ done, total: items.length });
          continue;
        }
        updateItem(item.id, { status: "uploading", error: null });
        try {
          const compressed = await compressImage(item.file);
          const fileData = await integrations.Core.UploadFile({ file: compressed });
          await entities.Photo.create({
            project_id: globalProjectId,
            category: item.category,
            title: item.title,
            description: item.description,
            location: item.location,
            taken_date: item.taken_date,
            file_url: fileData.file_url,
            file_name: compressed.name,
          });
          updateItem(item.id, { status: "done" });
        } catch (err) {
          errors.push({ name: item.file.name, error: err.message });
          updateItem(item.id, { status: "error", error: err.message });
        }
        done++;
        setUploadProgress({ done, total: items.length });
      }

      if (errors.length > 0 && errors.length === items.length) {
        throw new Error(`All uploads failed: ${errors[0].error}`);
      }
      return { errors };
    },
    onSuccess: ({ errors }) => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      if (errors.length === 0) {
        toast.success(`${items.length} photo${items.length === 1 ? "" : "s"} uploaded`);
        onClose();
      } else {
        toast.warning(`Uploaded ${items.length - errors.length} of ${items.length}; ${errors.length} failed`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const isUploading = uploadMutation.isPending;
  const projectName = projects.find((p) => p.id === globalProjectId)?.name;

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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose();
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
        {/* Header */}
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
                : `${items.length} photo${items.length === 1 ? "" : "s"} ready · ${(items.reduce((sum, i) => sum + i.file.size, 0) / (1024 * 1024)).toFixed(1)} MB total`}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: isUploading ? "not-allowed" : "pointer",
              padding: 4,
              opacity: isUploading ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Global controls */}
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
                value={globalProjectId}
                onChange={(e) => setGlobalProjectId(e.target.value)}
                style={inputStyle}
                disabled={isUploading}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Default Category</Label>
              <select
                value={globalCategory}
                onChange={(e) => {
                  setGlobalCategory(e.target.value);
                  applyToAll("category", e.target.value);
                }}
                style={inputStyle}
                disabled={isUploading}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Default Date</Label>
              <input
                type="date"
                value={globalDate}
                onChange={(e) => {
                  setGlobalDate(e.target.value);
                }}
                style={inputStyle}
                disabled={isUploading}
              />
            </div>
            <div>
              <Label>Default Location</Label>
              <input
                type="text"
                value={globalLocation}
                onChange={(e) => setGlobalLocation(e.target.value)}
                onBlur={(e) => applyToAll("location", e.target.value)}
                placeholder="e.g. North wing"
                style={inputStyle}
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Drop zone */}
          {items.length === 0 ? (
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
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
                JPEG, PNG, HEIC, WebP — up to {MAX_FILES} at once · auto-compressed for upload
              </div>
            </div>
          ) : (
            <>
              <div
                ref={dropZoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
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
                onClick={() => fileInputRef.current?.click()}
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

              {/* Items list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                    disabled={isUploading}
                  />
                ))}
              </div>
            </>
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

        {/* Footer */}
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
                    width: `${(uploadProgress.done / uploadProgress.total) * 100}%`,
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
                {uploadProgress.done} / {uploadProgress.total}
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
              onClick={() => uploadMutation.mutate()}
              disabled={
                isUploading || items.length === 0 || !globalProjectId
              }
              style={uploadButtonStyle(isUploading || items.length === 0 || !globalProjectId)}
            >
              <Upload size={12} />
              {isUploading
                ? "Uploading…"
                : `Upload ${items.length || ""} Photo${items.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, onChange, onRemove, disabled }) {
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
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Title"
          style={compactInputStyle}
          disabled={disabled}
        />
        <select
          value={item.category}
          onChange={(e) => onChange({ category: e.target.value })}
          style={compactInputStyle}
          disabled={disabled}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={item.taken_date}
          onChange={(e) => onChange({ taken_date: e.target.value })}
          style={compactInputStyle}
          disabled={disabled}
        />
        <input
          type="text"
          value={item.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Location"
          style={compactInputStyle}
          disabled={disabled}
        />
        <textarea
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
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
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 4,
        }}
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function Label({ children }) {
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

const inputStyle = {
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

const compactInputStyle = {
  ...inputStyle,
  fontSize: 10,
  padding: "5px 7px",
};

function cancelButtonStyle(disabled) {
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

function uploadButtonStyle(disabled) {
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
