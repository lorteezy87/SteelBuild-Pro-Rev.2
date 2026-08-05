/**
 * DrawingRegisterPanel — Drawing Register tab in the Detailing Control Center.
 *
 * The register IS the full editor. Embeds Drawings (embedded mode) so operators
 * can rename sets, edit sheets, bulk-update, delete, advance stage, and upload
 * without leaving the hub. The prior read-only set table + "Open full editor"
 * link was the chaos source.
 */
import type { ComponentType } from "react";
import DrawingsRaw from "@/pages/Drawings";

type AnyProps = Record<string, any>;
const Drawings = DrawingsRaw as unknown as ComponentType<AnyProps>;

/** Props retained for hub call-site compatibility; editor owns its own data. */
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

export default function DrawingRegisterPanel(_props: DrawingRegisterPanelProps) {
  return <Drawings embedded />;
}
