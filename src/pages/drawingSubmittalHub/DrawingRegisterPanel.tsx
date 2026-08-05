/**
 * DrawingRegisterPanel — Drawing Register tab in the Detailing Control Center.
 *
 * Renders the clean sheet-level register (same as Doc Control) for visual
 * parity with the requested clean table. Full set/sheet editor remains on
 * the standalone Drawings page.
 */
import { DrawingRegisterGridPanel } from "@/components/drawings/register/DrawingRegisterGridPanel";

/** Props retained for hub call-site compatibility. */
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
  return <DrawingRegisterGridPanel projectId={projectId} />;
}
