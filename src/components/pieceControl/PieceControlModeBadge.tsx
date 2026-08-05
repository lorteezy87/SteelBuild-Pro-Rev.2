import { Pill } from "@/components/command";
import type { PieceControlModePresentation } from "@/lib/pieceControl/presentation";

export function PieceControlModeBadge({
  presentation,
}: {
  presentation: PieceControlModePresentation;
}) {
  return (
    <div className="piece-mode">
      <Pill tone={presentation.tone}>{presentation.label}</Pill>
      <span className="piece-mode__authority">{presentation.authority}</span>
    </div>
  );
}
