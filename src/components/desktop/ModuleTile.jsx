/**
 * ModuleTile — a launcher tile: a darkened construction photo with a white
 * outline icon + label on top. When no photo exists yet (photoFor → null) it
 * falls back to a dark steel gradient so the launcher looks coherent before the
 * photo pack ships. The icon is the shared lucide outline from pageIcons.
 *
 * Props:
 *   page      route key (drives icon + photo lookup)
 *   label     display + accessible name (defaults to page)
 *   onClick   tile click handler
 *   photoSrc  optional explicit background override (defaults to photoFor(page))
 */
import React from "react";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";

export default function ModuleTile({ page, label, onClick, photoSrc }) {
  const name = label || page || "";
  const photo = photoSrc ?? photoFor(page);
  const Icon = getPageIcon(page);

  const bgStyle = photo
    ? {
        backgroundImage: `url("${photo}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0a0e15",
      }
    : {
        background: "linear-gradient(150deg, #222b3a 0%, #141c26 55%, #0a0e15 100%)",
        backgroundImage: "",
      };

  return (
    <button
      type="button"
      onClick={onClick}
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
        boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
        ...bgStyle,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(8,11,16,0.35) 0%, rgba(8,11,16,0.12) 40%, rgba(8,11,16,0.80) 100%)",
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
            textShadow: "0 1px 3px rgba(0,0,0,0.75)",
          }}
        >
          {name}
        </span>
      </span>
    </button>
  );
}
