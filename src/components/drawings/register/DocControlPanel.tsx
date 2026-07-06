/**
 * DocControlPanel — container for the Drawing Control module's views, shown under
 * the hub's "Doc Control" tab. A lightweight segmented sub-nav switches between
 * the register, review gates, impact board, and transmittal log.
 *
 * Slice 2c (command_ui native re-skin): when the `command_ui` flag is on, the
 * sub-nav renders on the kit's `cmd-chip-btn` segmented control and each view
 * renders its on-skin `*Panel` (kit chrome; same hooks / mutations / cache keys).
 * When the flag is off, the classic `sbd-btn` sub-nav + legacy views render — a
 * byte-identical fallback. The swap is per-view, so behavior is preserved either
 * way; no query, mutation, or cache-key changes on either path.
 */
import { useState } from "react";
import { useFlag } from "@/hooks/useFeatureFlag";
import { DrawingRegisterGrid } from "./DrawingRegisterGrid";
import { TransmittalLog } from "./TransmittalLog";
import { ReviewQueue } from "./ReviewQueue";
import { ImpactBoard } from "./ImpactBoard";
import { DrawingRegisterGridPanel } from "./DrawingRegisterGridPanel";
import { TransmittalLogPanel } from "./TransmittalLogPanel";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import { ImpactBoardPanel } from "./ImpactBoardPanel";

const VIEWS = [
  { key: "register", label: "Register" },
  { key: "reviews", label: "Reviews" },
  { key: "impacts", label: "Impacts" },
  { key: "transmittals", label: "Transmittals" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export function DocControlPanel({ projectId }: { projectId: string | null }) {
  const [view, setView] = useState<ViewKey>("register");
  const commandUi = useFlag("command_ui");

  const body = commandUi ? (
    <>
      {view === "register" && <DrawingRegisterGridPanel projectId={projectId} />}
      {view === "reviews" && <ReviewQueuePanel projectId={projectId} />}
      {view === "impacts" && <ImpactBoardPanel projectId={projectId} />}
      {view === "transmittals" && <TransmittalLogPanel projectId={projectId} />}
    </>
  ) : (
    <>
      {view === "register" && <DrawingRegisterGrid projectId={projectId} />}
      {view === "reviews" && <ReviewQueue projectId={projectId} />}
      {view === "impacts" && <ImpactBoard projectId={projectId} />}
      {view === "transmittals" && <TransmittalLog projectId={projectId} />}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="tablist" aria-label="Document control views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VIEWS.map((v) => {
          const active = view === v.key;
          const className = commandUi
            ? `cmd-chip-btn${active ? " is-active" : ""}`
            : active ? "sbd-btn sbd-btn-primary" : "sbd-btn sbd-btn-ghost";
          return (
            <button
              key={v.key}
              role="tab"
              aria-selected={active}
              type="button"
              className={className}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          );
        })}
      </div>
      {body}
    </div>
  );
}
