import { useQuery } from "@tanstack/react-query";
import { fetchLastSheetTransmittal } from "./sheetTransmittalEvidence";

export function useSheetTransmittalEvidence(
  projectId: string | null,
  drawingId: string | null,
  currentRevisionId: string | null,
) {
  return useQuery({
    // The transmittal editor invalidates this project prefix on write.
    queryKey: ["drawing-transmittals", projectId, "sheet", drawingId, currentRevisionId],
    enabled: Boolean(projectId && drawingId),
    staleTime: 60_000,
    queryFn: () => fetchLastSheetTransmittal(projectId as string, drawingId as string, currentRevisionId),
  });
}
