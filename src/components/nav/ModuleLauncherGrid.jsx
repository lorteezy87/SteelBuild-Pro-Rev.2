import React, { useState, useEffect, useRef } from "react";
import { LAUNCHER_MODULES, photoFor } from "@/config/launcherConfig";
import { getPageIcon } from "@/config/pageIcons";
import { prefetchRoute } from "@/lib/routePrefetch";

/**
 * ModuleLauncherGrid — top-bar "All Modules" dropdown rendered as small
 * photographic launcher tiles (the same /photos/desktop/<page>.webp images
 * used by the desktop launcher) instead of a text list. Searchable; navigates
 * via onNavigate(page). Tiles where a photo is missing fall back to a dark
 * gradient + the page's lucide icon + label.
 *
 * Props are call-compatible with the old ModulesDropdown ({ open, onClose,
 * onNavigate }); userRole/alertCounts are accepted but unused here.
 */
export default function ModuleLauncherGrid({ open, onClose, onNavigate }) {
  const ref = useRef(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  useEffect(() => { if (!open) setSearch(""); }, [open]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const modules = q
    ? LAUNCHER_MODULES.filter((m) => m.label.toLowerCase().includes(q) || m.page.toLowerCase().includes(q))
    : LAUNCHER_MODULES;

  return (
    <div
      ref={ref}
      className="sbd-card"
      style={{
        position: "absolute", top: "calc(100% + 6px)", right: 0,
        width: 460, maxHeight: 520,
        background: "var(--bg-surface-secondary)",
        border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border-default))",
        borderRadius: "var(--radius-card)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
        zIndex: 3000, overflow: "hidden", display: "flex", flexDirection: "column",
      }}
    >
      {/* Search */}
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
        <input
          placeholder="Search modules…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%", background: "var(--bg-input, var(--bg-page))",
            border: "1px solid var(--accent-border)", borderRadius: 6, padding: "6px 10px",
            color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Photo-tile grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
        gap: 8, padding: 12, overflowY: "auto",
      }}>
        {modules.map((m) => (
          <LauncherTile key={m.page} module={m} onNavigate={onNavigate} onClose={onClose} />
        ))}
        {modules.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: "18px 0", textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
            No modules match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--border-default)", padding: "7px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-surface)",
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--accent)", textTransform: "uppercase" }}>
          STEELBUILD&nbsp;PRO
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>
          {LAUNCHER_MODULES.length} MODULES
        </span>
      </div>
    </div>
  );
}

function LauncherTile({ module, onNavigate, onClose }) {
  const photo = photoFor(module.page);
  const Icon = getPageIcon(module.page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photo && !imgFailed;
  return (
    <button
      type="button"
      onClick={() => { onNavigate(module.page); onClose(); }}
      onMouseEnter={() => prefetchRoute(module.page)}
      onFocus={() => prefetchRoute(module.page)}
      title={module.label}
      aria-label={`Open ${module.label}`}
      style={{
        position: "relative", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", padding: 0, color: "#fff",
        background: "linear-gradient(150deg, #2a3548 0%, #141c26 55%, #0a0e15 100%)",
        boxShadow: "0 3px 10px rgba(0,0,0,0.35)", transition: "transform 0.12s ease, box-shadow 0.12s ease",
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
    >
      {showPhoto && (
        <img
          src={photo}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      {/* The construction photos carry no legible label at this tile size, so
          render the module name on a SOLID caption bar (readable on any photo)
          plus the icon floated over the art. Previously only the no-photo
          fallback tiles showed a name, leaving the rest a guessing game. */}
      {showPhoto && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(8,12,18,0.12) 0%, rgba(8,12,18,0.45) 100%)",
          }}
        />
      )}
      <span style={{ position: "absolute", top: 6, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Icon size={20} strokeWidth={1.7} color="#fff" aria-hidden="true" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,1))" }} />
      </span>
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(9,13,19,0.92)",
          borderTop: "1px solid rgba(255,255,255,0.14)",
          padding: "4px 5px 5px",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>{module.label}</span>
      </span>
    </button>
  );
}
