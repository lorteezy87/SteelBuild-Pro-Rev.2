/**
 * DocControlPanel — container for the Drawing Control module's views, shown under
 * the hub's "Doc Control" tab. A lightweight segmented sub-nav switches between
 * the register and the transmittal log; review gates / impact board / markups
 * slot in here as later phases land.
 */
import { useState } from "react";
import { DrawingRegisterGrid } from "./DrawingRegisterGrid";
import { TransmittalLog } from "./TransmittalLog";
import { ReviewQueue } from "./ReviewQueue";
import { ImpactBoard } from "./ImpactBoard";

const VIEWS = [
  { key: "register", label: "Register" },
  { key: "reviews", label: "Reviews" },
  { key: "impacts", label: "Impacts" },
  { key: "transmittals", label: "Transmittals" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export function DocControlPanel({ projectId }: { projectId: string | null }) {
  const [view, setView] = useState<ViewKey>("register");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="tablist" aria-label="Document control views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            type="button"
            className={view === v.key ? "sbd-btn sbd-btn-primary" : "sbd-btn sbd-btn-ghost"}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "register" && <DrawingRegisterGrid projectId={projectId} />}
      {view === "reviews" && <ReviewQueue projectId={projectId} />}
      {view === "impacts" && <ImpactBoard projectId={projectId} />}
      {view === "transmittals" && <TransmittalLog projectId={projectId} />}
    </div>
  );
}
