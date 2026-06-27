/**
 * Shimmer skeletons used while data loads and in the rich empty
 * state's ghost preview. Pure visuals — no props beyond size.
 *
 * Keyframes for the shimmer animation are declared in a `<style>`
 * block by the pages that render these (empty state / loading
 * variants), so this file stays CSS-import-free.
 */

import React from "react";
import { CARD } from "./constants";

export function SkeletonBar({ width = "100%", height = 12, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: "linear-gradient(90deg, var(--bg-surface-high) 25%, var(--bg-surface-highest) 50%, var(--bg-surface-high) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.8s infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonKPICard() {
  return (
    <div style={{ ...CARD, borderTop: "2px solid var(--border-default)", padding: "16px 18px" }}>
      <SkeletonBar width={80}  height={8}  style={{ marginBottom: 12 }} />
      <SkeletonBar width={100} height={22} style={{ marginBottom: 8 }} />
      <SkeletonBar width={60}  height={8} />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 2fr 90px 50px 100px 100px 80px 60px 50px 120px 60px",
        padding: "10px 16px",
        gap: 8,
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <SkeletonBar width={24} height={10} />
      <SkeletonBar width="80%" height={10} />
      <SkeletonBar width={60} height={10} />
      <SkeletonBar width={12} height={12} style={{ borderRadius: "50%" }} />
      <SkeletonBar width={70} height={10} />
      <SkeletonBar width={70} height={10} />
      <SkeletonBar width={50} height={10} />
      <SkeletonBar width={30} height={10} />
      <SkeletonBar width={24} height={10} />
      <SkeletonBar width="90%" height={8} />
      <SkeletonBar width={40} height={18} style={{ borderRadius: "var(--radius-btn)" }} />
    </div>
  );
}
