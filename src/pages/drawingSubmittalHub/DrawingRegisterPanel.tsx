/**
 * DrawingRegisterPanel — Drawing Register tab in the Detailing Control Center.
 *
 * Defaults to the sheet register. The set view exposes the existing revision
 * upload and summary workflow without discarding the hub callbacks.
 */
import { DrawingRegisterGridPanel } from "@/components/drawings/register/DrawingRegisterGridPanel";
import { lazy, Suspense, useState } from "react";

const DrawingRegisterTable = lazy(() => import("./drawingRegisterTable").then(module => ({ default: module.DrawingRegisterTable })));

/** Shared evidence and callbacks for the sheet and set views. */
export interface DrawingRegisterPanelProps {
  setPackages?: any[];
  projectId?: string;
  activeProject?: any;
  drawingSets?: any[];
  isLoading?: boolean;
  healthByKey?: Map<string, any>;
  currentRevByDrawingId?: Map<string, any>;
  summariesBySet?: Map<string, any>;
  onRevisionUploaded?: (pkgKey: string) => void;
  onOpenSummary?: (summary: any) => void;
}

export default function DrawingRegisterPanel(props: DrawingRegisterPanelProps) {
  const projectId = props.projectId ?? props.activeProject?.id ?? null;
  const [view, setView] = useState<"sheets" | "sets">("sheets");
  return <>
    <div className="cmd-filterbar" role="group" aria-label="Drawing register view">
      <button type="button" className="cmd-btn" aria-pressed={view === "sheets"} onClick={() => setView("sheets")}>Sheets</button>
      <button type="button" className="cmd-btn" aria-pressed={view === "sets"} onClick={() => setView("sets")}>Sets &amp; revisions</button>
    </div>
    {view === "sheets" ? <DrawingRegisterGridPanel projectId={projectId} /> :
      <Suspense fallback={<p role="status">Loading drawing sets…</p>}>
        <DrawingRegisterTable {...props} projectId={projectId ?? undefined} setPackages={props.setPackages ?? []} />
      </Suspense>}
  </>;
}
