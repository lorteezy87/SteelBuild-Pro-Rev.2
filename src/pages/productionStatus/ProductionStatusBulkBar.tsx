import { useState } from "react";
import { PRODUCTION_STAGES, type ProductionStage } from "@/lib/importProductionStatus";

type ProductionStatusBulkBarProps = {
  selectedCount: number;
  pending?: boolean;
  onApplyStage: (stage: ProductionStage) => void;
  onClear: () => void;
};

/**
 * Unified bulk action bar for Production Status — set fab stage on the
 * current selection. Mirrors PieceRegisterBulkBar density without WP/hold
 * controls (those live on the Piece Register).
 */
export default function ProductionStatusBulkBar({
  selectedCount,
  pending = false,
  onApplyStage,
  onClear,
}: ProductionStatusBulkBarProps) {
  const [stage, setStage] = useState<ProductionStage | "">("");

  if (selectedCount <= 0) return null;

  return (
    <div
      className="piece-selection-bar piece-selection-bar--bulk"
      aria-label="Bulk production status actions"
    >
      <strong>{selectedCount} selected</strong>

      <div className="piece-bulk-group">
        <label className="piece-command-field" htmlFor="prod-bulk-stage">
          Set stage
          <select
            id="prod-bulk-stage"
            className="piece-command-control"
            value={stage}
            disabled={pending}
            onChange={(e) => setStage(e.target.value as ProductionStage | "")}
            aria-label="Bulk stage"
          >
            <option value="">Choose stage…</option>
            {PRODUCTION_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="cmd-btn cmd-btn--primary"
          disabled={pending || !stage}
          onClick={() => stage && onApplyStage(stage)}
        >
          Set for selection
        </button>

        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          disabled={pending}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
