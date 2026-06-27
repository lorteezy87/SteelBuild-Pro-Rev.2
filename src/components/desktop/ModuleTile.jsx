/**
 * ModuleTile — a launcher tile: a darkened construction photo with a white
 * outline icon + label on top. The photo loads lazily as an <img>; if missing
 * or it fails (onError) the tile shows the dark steel gradient. The tile is a
 * cinematic dark image card in BOTH themes, so its text/icon stay white on
 * purpose (do not swap to theme tokens). Memoized so the launcher grid doesn't
 * re-render unchanged tiles on search/category changes.
 *
 * Props: page, label, onSelect(page), photoSrc (optional override).
 */
import React, { useState } from "react";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";

function ModuleTile({ page, label, onSelect, photoSrc }) {
  const name = label || page || "";
  const photo = photoSrc ?? photoFor(page);
  const Icon = getPageIcon(page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photo && !imgFailed;

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
        aspectRatio: "3 / 2",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
        padding: 0,
        color: "#fff",
        background: "linear-gradient(150deg, #222b3a 0%, #141c26 55%, #0a0e15 100%)",
        boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
      }}
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
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(8,11,16,0.45) 0%, rgba(8,11,16,0.22) 40%, rgba(8,11,16,0.86) 100%)",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 10,
        }}
      >
        <Icon
          size={34}
          strokeWidth={1.6}
          color="#fff"
          aria-hidden="true"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.65))" }}
        />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
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
    </button>
  );
}

export default React.memo(ModuleTile);
