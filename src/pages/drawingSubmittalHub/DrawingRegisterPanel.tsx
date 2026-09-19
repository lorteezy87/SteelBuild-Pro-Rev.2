/**
 * DrawingRegisterPanel — Drawing Register tab in the Detailing Control Center.
 *
 * Three views, kept in ?hub_view= (useHubView: replace, never adds history):
 *   sheets (default)  the sheet register (DrawingRegisterGridPanel).
 *   sets              sets & revisions: the revision upload and summary
 *                     workflow, without discarding the hub callbacks.
 *   reviews           the role-based Review Queue (formerly Doc Control's
 *                     Reviews view).
 *
 * The sheet and set views are wrapped in DrawingRegisterWorkbench, which puts
 * the editing actions (upload set, new revision, add sheet, import log, bulk
 * edit, export packages) directly above the register. They used to live only
 * on /Drawings, an unlinked page reached through "Open full editor ↗"; that
 * route now redirects here. Reviews is left bare — it is a queue of other
 * people's sheets, not a place to upload one.
 */
import { DrawingRegisterGridPanel } from "@/components/drawings/register/DrawingRegisterGridPanel";
import { lazy, Suspense } from "react";
import DrawingRegisterWorkbench from "./DrawingRegisterWorkbench";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { HubViewToggle } from "./HubViewToggle";
import type { HubViewOption } from "./HubViewToggle";
import { useHubView } from "./useHubView";
import type { HubView } from "./hubLinks";
import type { SavedRevisionSummary } from "@/lib/revisionSummaryRepo";
import type { SetPackage } from "./types";

const DrawingRegisterTable = lazy(() => import("./drawingRegisterTable").then(module => ({ default: module.DrawingRegisterTable })));
const ReviewQueuePanel = lazyWithRetry(() =>
  import("@/components/drawings/register/ReviewQueuePanel").then((m) => ({ default: m.ReviewQueuePanel })),
);

const VIEWS: readonly HubViewOption<HubView<"drawings">>[] = [
  { key: "sheets", label: "Sheets" },
  { key: "sets", label: "Sets & revisions" },
  { key: "reviews", label: "Reviews" },
];

/** Shared evidence and callbacks for the sheet and set views. */
export interface DrawingRegisterPanelProps {
  setPackages?: SetPackage[];
  projectId?: string;
  activeProject?: { id?: string | null; name?: string | null } | null;
  drawingSets?: unknown[];
  isLoading?: boolean;
  healthByKey?: Map<string, any>;
  currentRevByDrawingId?: Map<string, any>;
  summariesBySet?: Map<string, SavedRevisionSummary>;
  onRevisionUploaded?: (pkgKey: string) => void | Promise<void>;
  onOpenSummary?: (summary: SavedRevisionSummary["summary"]) => void;
}

export default function DrawingRegisterPanel(props: DrawingRegisterPanelProps) {
  const projectId = props.projectId ?? props.activeProject?.id ?? null;
  const [view, setView] = useHubView("drawings");
  return <>
    <HubViewToggle label="Drawing register view" options={VIEWS} value={view} onChange={setView} />
    {view === "sheets" && (
      <DrawingRegisterWorkbench projectId={projectId} activeProject={props.activeProject}>
        {({ selected, onToggleSelect, onToggleSelectAll }) => (
          <DrawingRegisterGridPanel
            projectId={projectId}
            activeProject={props.activeProject}
            drawingSets={props.drawingSets}
            setPackages={props.setPackages}
            summariesBySet={props.summariesBySet}
            onRevisionUploaded={props.onRevisionUploaded}
            onOpenSummary={props.onOpenSummary}
            selected={selected}
            onToggleSelect={onToggleSelect}
            onToggleSelectAll={onToggleSelectAll}
          />
        )}
      </DrawingRegisterWorkbench>
    )}
    {view === "sets" && (
      <DrawingRegisterWorkbench projectId={projectId} activeProject={props.activeProject}>
        {() => (
          <Suspense fallback={<p role="status">Loading drawing sets…</p>}>
            <DrawingRegisterTable {...props} projectId={projectId ?? undefined} setPackages={props.setPackages ?? []} />
          </Suspense>
        )}
      </DrawingRegisterWorkbench>
    )}
    {view === "reviews" && (
      <Suspense fallback={<p role="status">Loading reviews…</p>}>
        <ReviewQueuePanel key={projectId} projectId={projectId} />
      </Suspense>
    )}
  </>;
}
