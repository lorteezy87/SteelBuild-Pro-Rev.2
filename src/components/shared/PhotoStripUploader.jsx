/**
 * PhotoStripUploader.jsx — small, reusable multi-photo uploader for inline
 * use inside forms (Daily Logs, Punchlist).
 *
 * Wraps integrations.Core.UploadFile (the same path Mitigations,
 * Photos, Inspections, Drawings, etc. use).  Stores results as an array of
 * `{ file_url, name, uploaded_at }` objects on whatever JSONB column the
 * caller persists (e.g. daily_logs.photos, punchlist_items.photos).
 *
 * Props
 *   value     — array of photo objects (controlled)
 *   onChange  — (nextArray) => void
 *   disabled  — disable upload button (e.g. while a parent save is in flight)
 *   max       — soft cap on number of photos (default 12)
 */

import React, { useRef, useState } from "react";
import { integrations } from "@/api/supabaseClient";
import { toast } from "sonner";
import { compressImage } from "@/utils/compressImage";

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

export default function PhotoStripUploader({
  value = [],
  onChange,
  disabled = false,
  max = 12,
  label = "Photos",
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const photos = Array.isArray(value) ? value : [];

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (photos.length + files.length > max) {
      toast.error(`Max ${max} photos per record`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const rawFile of files) {
        try {
          const file = await compressImage(rawFile);
          const result = await integrations.Core.UploadFile({ file, workflow: "photo" });
          uploaded.push({
            file_url: result.file_url || result.path,
            path: result.path,
            name: file.name,
            uploaded_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[PhotoStripUploader] upload failed:", err);
          toast.error(`Upload failed: ${rawFile.name}`);
        }
      }
      if (uploaded.length > 0) {
        onChange?.([...photos, ...uploaded]);
        toast.success(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx) => {
    const next = photos.filter((_, i) => i !== idx);
    onChange?.(next);
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        {photos.map((p, idx) => {
          const url = p.file_url || p.path || p.url || "";
          return (
            <div
              key={idx}
              style={{
                position: "relative",
                width: 72,
                height: 72,
                borderRadius: 8,
                border: "1px solid var(--border-default)",
                overflow: "hidden",
                background: "var(--bg-input)",
                flexShrink: 0,
              }}
              title={p.name || url}
            >
              {url ? (
                <img
                  src={url}
                  alt={p.name || `photo-${idx}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    // Storage signed URLs can expire — fall back to a name label.
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); removeAt(idx); }}
                disabled={disabled}
                aria-label="Remove photo"
                style={{
                  // 40px transparent hit area anchored top-right so the tap
                  // target clears the mobile min while the visible badge stays
                  // small (the thumbnail itself has no other click action).
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 40,
                  height: 40,
                  border: "none",
                  background: "transparent",
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  padding: 2,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: "rgba(7,9,14,0.78)",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {"×"}
                </span>
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || photos.length >= max}
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            border: "2px dashed var(--border-default)",
            background: "var(--bg-input)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: disabled || uploading ? "wait" : "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !uploading && photos.length < max) {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {uploading ? "..." : "+"}
          <span style={{ fontSize: 8 }}>
            {uploading ? "" : photos.length >= max ? "MAX" : "ADD"}
          </span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
