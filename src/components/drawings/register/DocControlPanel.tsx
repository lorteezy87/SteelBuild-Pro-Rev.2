/**
 * Canonical document-control panel.
 */
import { useState } from "react";
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

  const body = (
    <>
      {view === "register" && <DrawingRegisterGridPanel projectId={projectId} />}
      {view === "reviews" && <ReviewQueuePanel projectId={projectId} />}
      {view === "impacts" && <ImpactBoardPanel projectId={projectId} />}
      {view === "transmittals" && <TransmittalLogPanel projectId={projectId} />}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="tablist" aria-label="Document control views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VIEWS.map((v) => {
          const active = view === v.key;
          const className = `cmd-chip-btn${active ? " is-active" : ""}`;
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
