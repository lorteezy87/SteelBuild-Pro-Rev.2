/**
 * ModuleTile — a square launcher tile.
 *
 * Generated tiles are COMPLETE images (photo + icon + label baked in), so when
 * a photo is present the tile shows the full image as its face with NO overlay.
 * When there's no photo yet, it falls back to a dark gradient + the shared white
 * lucide icon + label. The button's aria-label carries the accessible name in
 * both cases. Memoized so the grid doesn't re-render unchanged tiles.
 *
 * Props: page, label, onSelect(page), photoSrc (optional override).
 */
import React, { useState } from "react";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";
import { useTheme } from "@/components/shared/ThemeContext";

const FALLBACK_GRADIENT = {
  dark: "linear-gradient(150deg, #222b3a 0%, #141c26 55%, #0a0e15 100%)",
  light: "linear-gradient(150deg, #e8edf3 0%, #d4dce6 55%, #c5ced9 100%)",
};

function ModuleTile({ page, label, onSelect, photoSrc }) {
  const { theme } = useTheme();
  const name = label || page || "";
  const photo = photoSrc ?? photoFor(page);
  const Icon = getPageIcon(page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photo && !imgFailed;
  const fallbackGradient = FALLBACK_GRADIENT[theme] ?? FALLBACK_GRADIENT.dark;

  return (
    <button
      type="button"
      onClick={() => onSelect && onSelect(page)}
      aria-label={`Open ${name}`}
      className="desk-launch-tile"
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid var(--desk-tile-edge)",
        cursor: "pointer",
        padding: 0,
        color: "#fff",
        background: fallbackGradient,
        boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
      }}
    >
      {showPhoto ? (
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
      ) : (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 12,
          }}
        >
          <Icon
            size={40}
            strokeWidth={1.5}
            color="#fff"
            aria-hidden="true"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.65))" }}
          />
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.2,
              textShadow: "0 1px 3px rgba(0,0,0,0.85)",
            }}
          >
            {name}
          </span>
        </span>
      )}
    </button>
  );
}

export default React.memo(ModuleTile);
