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
        boxShadow: "var(--shadow-lg)",
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
        border: "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)", cursor: "pointer", padding: 0, color: "var(--text-primary)",
        background: "linear-gradient(150deg, var(--bg-surface-high, var(--bg-surface-secondary)) 0%, var(--bg-elevated, var(--bg-surface)) 55%, var(--bg-base) 100%)",
        boxShadow: "var(--shadow-card)", transition: "transform 0.12s ease, box-shadow 0.12s ease",
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
            background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 12%, transparent) 0%, color-mix(in srgb, var(--bg-base) 45%, transparent) 100%)",
          }}
        />
      )}
      <span style={{ position: "absolute", top: 6, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Icon size={20} strokeWidth={1.7} color="var(--text-primary)" aria-hidden="true" style={{ filter: "drop-shadow(0 1px 4px var(--bg-base))" }} />
      </span>
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "color-mix(in srgb, var(--bg-elevated, var(--bg-surface)) 94%, transparent)",
          borderTop: "1px solid var(--border-default)",
          padding: "4px 5px 5px",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.15 }}>{module.label}</span>
      </span>
    </button>
  );
}
