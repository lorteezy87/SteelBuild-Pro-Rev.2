/**
 * RevisionImpactViews — the Revision Impact tab: two impact sources under one
 * toggle, kept in ?hub_view= (replace, so switching never adds history).
 *
 *   computed (default)  RevisionImpactPanel. Change-revisions joined to their
 *                       sheet's downstream status, derived from data; the
 *                       Compare action opens the revision overlay.
 *   log                 ImpactBoardPanel. drawing_impacts rows people log and
 *                       move through a status board (formerly Doc Control's
 *                       Impacts view).
 *
 * The caption names the active source, so the two lists are never read as one.
 */
import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import RevisionImpactPanel from "./RevisionImpactPanel";
import { HubViewToggle } from "./HubViewToggle";
import type { HubViewOption } from "./HubViewToggle";
import { useHubView } from "./useHubView";
import type { HubView } from "./hubLinks";

// Most visits read the computed board; the log is its own chunk.
const ImpactBoardPanel = lazyWithRetry(() =>
  import("@/components/drawings/register/ImpactBoardPanel").then((m) => ({ default: m.ImpactBoardPanel })),
);

interface RevisionImpactOption extends HubViewOption<HubView<"revimpact">> {
  /** Names where the view's rows come from. */
  caption: string;
}

const VIEWS: readonly RevisionImpactOption[] = [
  { key: "computed", label: "Computed from revisions", caption: "Derived from drawing revisions and downstream status" },
  { key: "log", label: "Impact log", caption: "Manually logged drawing impacts" },
];

export interface RevisionImpactViewsProps {
  projectId: string | null;
  /** RevisionImpactPanel's props, passed through unchanged. */
  rows?: any[];
  onCompareRevision?: (drawingId: string) => void;
  isLoading?: boolean;
  rosterLoaded?: boolean;
}

export default function RevisionImpactViews({ projectId, ...computedProps }: RevisionImpactViewsProps) {
  const [view, setView] = useHubView("revimpact");
  const caption = VIEWS.find((option) => option.key === view)?.caption;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <HubViewToggle label="Revision impact source" options={VIEWS} value={view} onChange={setView}>
        <span style={{ fontSize: 12, color: "var(--cmd-text-muted)" }}>Source: {caption}</span>
      </HubViewToggle>
      {view === "computed" ? (
        <RevisionImpactPanel {...computedProps} />
      ) : (
        <Suspense fallback={<p role="status">Loading impact log…</p>}>
          <ImpactBoardPanel key={projectId} projectId={projectId} />
        </Suspense>
      )}
    </div>
  );
}
