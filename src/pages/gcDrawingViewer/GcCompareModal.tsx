import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Columns2, Layers, MoveHorizontal, RotateCcw, ZoomIn, ZoomOut,
} from "lucide-react";
import { Modal } from "@/pages/gcDocuments/dsPrimitives";
import { RASTER_TARGET_WIDTH } from "@/lib/pdfRasterize";
import { OLD_TINT, NEW_TINT, type CompareMode } from "@/lib/rasterCompare";
import { useRasterCompare } from "@/hooks/useRasterCompare";
import {
  buildGcCompareModel,
  type GcChainSet,
  type GcChainSheet,
} from "@/lib/gcDocuments/gcRevisionChain";

/**
 * GcCompareModal — overlay two issuances of the same GC sheet.
 *
 * Shares the raster engine with the shop-drawing RevisionCompareModal
 * (useRasterCompare + rasterCompare), and shares nothing else with it. That
 * modal also carries the AI revision-impact rail, which writes
 * `drawing_revision_deltas` rows foreign-keyed to `drawings.id` and
 * `drawing_revisions.id`. A gc_drawings id satisfies neither, so the rail is
 * deliberately absent here rather than disabled — a control that cannot work is
 * worse than no control.
 *
 * Uses the design-system Modal, not Radix (CLAUDE.md), and no <form>.
 */

const mono = "var(--font-mono)";
const PDF_PAGE_BACKGROUND = "#fff";

const MODES: { key: CompareMode; label: string; icon: typeof Layers }[] = [
  { key: "overlay", label: "Overlay", icon: Layers },
  { key: "wipe", label: "Wipe", icon: MoveHorizontal },
  { key: "side", label: "Side by side", icon: Columns2 },
];

/** Why there is nothing to compare, in the reader's terms. */
const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
  "no-sheet": {
    title: "No document open",
    body: "Pick a GC drawing from the list first.",
  },
  "no-file": {
    title: "No file attached",
    body: "This sheet is logged in the register but has no PDF uploaded against it, so there is nothing to render.",
  },
  "single-version": {
    title: "Only one version of this sheet",
    body:
      "We have received this sheet number once. When the GC reissues it in an ASI, addendum or bulletin, upload that issuance and both versions will be selectable here.",
  },
  "versions-without-files": {
    title: "The other version has no PDF",
    body:
      "Another issuance of this sheet number is logged, but no file is attached to it yet. Upload the PDF against that row and the two can be overlaid.",
  },
};

export interface GcCompareModalProps {
  open: boolean;
  onClose: () => void;
  active: GcChainSheet | null;
  sheets: readonly GcChainSheet[];
  sets: readonly GcChainSet[];
}

export default function GcCompareModal({
  open,
  onClose,
  active,
  sheets,
  sets,
}: GcCompareModalProps) {
  const model = useMemo(
    () => buildGcCompareModel({ active, sheets, sets }),
    [active, sheets, sets],
  );
  const { candidates, unavailable } = model;

  const [oldKey, setOldKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Default pair: the newest issuance against the one before it.
  useEffect(() => {
    if (!open) return;
    const keys = candidates.map((c) => c.key);
    if (!newKey || !keys.includes(newKey)) setNewKey(keys[0] ?? null);
    if (!oldKey || !keys.includes(oldKey) || oldKey === newKey) setOldKey(keys[1] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const oldSel = candidates.find((c) => c.key === oldKey) ?? null;
  const newSel = candidates.find((c) => c.key === newKey) ?? null;

  const {
    mode, setMode, wipePct, setWipePct, offset, nudge, resetOffset,
    zoom, zoomBy, rendering, renderError,
    displayRef, sideOldRef, sideNewRef,
  } = useRasterCompare({ open, oldPage: oldSel, newPage: newSel });

  const sheetLabel = [active?.drawing_number, active?.title].filter(Boolean).join(" — ");

  const copy = unavailable ? UNAVAILABLE_COPY[unavailable] : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1500}
      eyebrow="GC DOCUMENTS"
      title={`Compare issuances${sheetLabel ? ` — ${sheetLabel}` : ""}`}
    >
      {copy ? (
        <div
          style={{
            display: "flex", flexDirection: "column", gap: 8, padding: 28,
            border: "1px dashed var(--border-default)", borderRadius: 10, textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {copy.title}
          </p>
          <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.65 }}>
            {copy.body}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          {/* ── Controls ────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: OLD_TINT, letterSpacing: "0.08em" }}>OLD</span>
            <select
              className="sbd-select"
              value={oldKey || ""}
              onChange={(e) => setOldKey(e.target.value)}
              aria-label="Older issuance"
              style={{ fontFamily: mono, fontSize: 10, padding: "5px 8px", maxWidth: 260 }}
            >
              {candidates.filter((c) => c.key !== newKey).map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>

            <button
              type="button"
              className="sbd-btn-ghost"
              onClick={() => { setOldKey(newKey); setNewKey(oldKey); }}
              title="Swap old/new"
              style={{ minHeight: 30, padding: "4px 8px", display: "inline-flex", alignItems: "center" }}
            >
              <ArrowLeftRight size={13} />
            </button>

            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: NEW_TINT, letterSpacing: "0.08em" }}>NEW</span>
            <select
              className="sbd-select"
              value={newKey || ""}
              onChange={(e) => setNewKey(e.target.value)}
              aria-label="Newer issuance"
              style={{ fontFamily: mono, fontSize: 10, padding: "5px 8px", maxWidth: 260 }}
            >
              {candidates.filter((c) => c.key !== oldKey).map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>

            <span style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 2px" }} />

            {MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  minHeight: 30, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                  border: `1px solid ${mode === key ? "var(--accent)" : "var(--border-default)"}`,
                  background: mode === key ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                  color: mode === key ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                }}
              >
                <Icon size={12} /> {label}
              </button>
            ))}

            {mode === "wipe" && (
              <input
                type="range" min={0} max={100} value={wipePct}
                onChange={(e) => setWipePct(Number(e.target.value))}
                aria-label="Wipe position"
                style={{ width: 140, accentColor: "var(--accent)" }}
              />
            )}

            <span style={{ flex: 1 }} />

            {mode !== "side" && (
              <div
                style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
                title="Nudge the NEW layer to align sheets that shifted between prints"
              >
                <button type="button" className="sbd-btn-ghost" aria-label="Nudge left" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(-1, 0)}><ChevronLeft size={12} /></button>
                <button type="button" className="sbd-btn-ghost" aria-label="Nudge up" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(0, -1)}><ChevronUp size={12} /></button>
                <button type="button" className="sbd-btn-ghost" aria-label="Nudge down" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(0, 1)}><ChevronDown size={12} /></button>
                <button type="button" className="sbd-btn-ghost" aria-label="Nudge right" style={{ minHeight: 28, padding: "2px 6px" }} onClick={() => nudge(1, 0)}><ChevronRight size={12} /></button>
                <button type="button" className="sbd-btn-ghost" aria-label="Reset alignment" style={{ minHeight: 28, padding: "2px 6px" }} onClick={resetOffset}><RotateCcw size={12} /></button>
                {(offset.x !== 0 || offset.y !== 0) && (
                  <span className="sbd-num" style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>
                    {offset.x},{offset.y}px
                  </span>
                )}
              </div>
            )}

            <button type="button" className="sbd-btn-ghost" aria-label="Zoom out" style={{ minHeight: 28, padding: "2px 7px" }} onClick={() => zoomBy(-1)}><ZoomOut size={13} /></button>
            <span className="sbd-num" style={{ fontFamily: mono, fontSize: 10, color: "var(--text-muted)", minWidth: 34, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button type="button" className="sbd-btn-ghost" aria-label="Zoom in" style={{ minHeight: 28, padding: "2px 7px" }} onClick={() => zoomBy(1)}><ZoomIn size={13} /></button>
          </div>

          {/* ── Legend ──────────────────────────────────────────────── */}
          {mode === "overlay" && (
            <div style={{ display: "flex", gap: 12, flexShrink: 0, fontFamily: mono, fontSize: 9, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              <span><span style={{ color: OLD_TINT }}>■</span> only in OLD (removed)</span>
              <span><span style={{ color: NEW_TINT }}>■</span> only in NEW (added)</span>
              <span><span style={{ color: "var(--text-primary)" }}>■</span> unchanged</span>
            </div>
          )}

          {/* The overlay is a raster diff of two prints, not a reading of the
              drawings. It shows where ink moved; it does not know a beam got
              heavier. Say so, so nobody treats a clean overlay as a clearance. */}
          <p style={{ margin: 0, flexShrink: 0, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Pixel overlay of the two prints. It shows <em>where</em> the sheets differ — read the
            changes off the drawings themselves before acting on them.
          </p>

          {/* ── Canvas ──────────────────────────────────────────────── */}
          <div
            style={{
              flex: 1, minHeight: 300, minWidth: 0, overflow: "auto", borderRadius: 10,
              border: "1px solid var(--border-default)", background: "var(--bg-surface-highest)",
              position: "relative",
            }}
          >
            {rendering && (
              <div
                style={{
                  position: "absolute", inset: 0, zIndex: 2, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 10,
                  background: "rgba(13,17,23,0.55)", color: "var(--text-primary)",
                  fontFamily: mono, fontSize: 11, letterSpacing: "0.08em",
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.25)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
                RENDERING SHEETS…
              </div>
            )}

            {renderError ? (
              <div style={{ padding: 24, color: "var(--status-error)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                {renderError}
              </div>
            ) : mode === "side" ? (
              <div style={{ display: "flex", gap: 8, padding: 10, alignItems: "flex-start" }}>
                {[
                  { ref: sideOldRef, label: oldSel?.label, tintColor: OLD_TINT },
                  { ref: sideNewRef, label: newSel?.label, tintColor: NEW_TINT },
                ].map(({ ref, label, tintColor }, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: tintColor, letterSpacing: "0.08em", marginBottom: 4 }}>
                      {label || "—"}
                    </div>
                    <canvas ref={ref} style={{ width: `${100 * zoom}%`, height: "auto", display: "block", background: PDF_PAGE_BACKGROUND, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 10 }}>
                <canvas
                  ref={displayRef}
                  style={{
                    width: `${RASTER_TARGET_WIDTH * zoom}px`,
                    maxWidth: zoom === 1 ? "100%" : undefined,
                    height: "auto", display: "block", background: PDF_PAGE_BACKGROUND, borderRadius: 4,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
