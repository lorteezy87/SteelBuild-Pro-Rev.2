import { Archive } from "lucide-react";
import { useState } from "react";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";

export type BulkAttributeFormValues = {
  updateSequence: boolean;
  updateArea: boolean;
  sequenceNumber: string;
  erectionArea: string;
};

type WorkPackageOption = {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  title?: string | null;
};

type PieceRegisterBulkBarProps = {
  selectedCount: number;
  workPackages: WorkPackageOption[];
  canBulkUpdate: boolean;
  canArchive: boolean;
  pending: boolean;
  onAssign: (workPackageId: string) => void;
  onUnassign: () => void;
  onApplyAttributes: (values: BulkAttributeFormValues) => void;
  onHold: (reason: string) => void;
  onClearHold: () => void;
  onArchive: () => void;
};

export default function PieceRegisterBulkBar({
  selectedCount,
  workPackages,
  canBulkUpdate,
  canArchive,
  pending,
  onAssign,
  onUnassign,
  onApplyAttributes,
  onHold,
  onClearHold,
  onArchive,
}: PieceRegisterBulkBarProps) {
  const [workPackageId, setWorkPackageId] = useState("");
  const [updateSequence, setUpdateSequence] = useState(false);
  const [updateArea, setUpdateArea] = useState(false);
  const [sequenceNumber, setSequenceNumber] = useState("");
  const [erectionArea, setErectionArea] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const canApplyAttrs =
    canBulkUpdate && !pending && (updateSequence || updateArea);

  return (
    <div className="piece-selection-bar piece-selection-bar--bulk">
      <strong>{selectedCount} selected</strong>

      <div className="piece-bulk-group">
        <label className="piece-command-field" htmlFor="piece-bulk-assign-wp">
          Assign work package
          <select
            id="piece-bulk-assign-wp"
            className="piece-command-control"
            value={workPackageId}
            disabled={!canBulkUpdate || pending}
            onChange={(event) => setWorkPackageId(event.target.value)}
          >
            <option value="">Select package</option>
            {workPackages.map((wp) => (
              <option key={wp.id} value={wp.id}>
                {formatWorkPackageTitle(wp)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="cmd-btn cmd-btn--primary"
          disabled={!canBulkUpdate || pending || !workPackageId}
          onClick={() => onAssign(workPackageId)}
        >
          Assign WP
        </button>
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          disabled={!canBulkUpdate || pending}
          onClick={onUnassign}
        >
          Unassign
        </button>
      </div>

      <div className="piece-bulk-group">
        <label className="piece-bulk-check" htmlFor="piece-bulk-update-sequence">
          <input
            id="piece-bulk-update-sequence"
            type="checkbox"
            checked={updateSequence}
            disabled={!canBulkUpdate || pending}
            onChange={(event) => setUpdateSequence(event.target.checked)}
          />
          Update sequence
        </label>
        <label className="piece-command-field" htmlFor="piece-bulk-sequence">
          Sequence
          <input
            id="piece-bulk-sequence"
            className="piece-command-control"
            value={sequenceNumber}
            disabled={!canBulkUpdate || pending || !updateSequence}
            onChange={(event) => setSequenceNumber(event.target.value)}
            placeholder="e.g. 22"
          />
        </label>
        <label className="piece-bulk-check" htmlFor="piece-bulk-update-area">
          <input
            id="piece-bulk-update-area"
            type="checkbox"
            checked={updateArea}
            disabled={!canBulkUpdate || pending}
            onChange={(event) => setUpdateArea(event.target.checked)}
          />
          Update area
        </label>
        <label className="piece-command-field" htmlFor="piece-bulk-area">
          Erection area
          <input
            id="piece-bulk-area"
            className="piece-command-control"
            value={erectionArea}
            disabled={!canBulkUpdate || pending || !updateArea}
            onChange={(event) => setErectionArea(event.target.value)}
            placeholder="e.g. Area A"
          />
        </label>
        <button
          type="button"
          className="cmd-btn cmd-btn--primary"
          disabled={!canApplyAttrs}
          onClick={() =>
            onApplyAttributes({
              updateSequence,
              updateArea,
              sequenceNumber,
              erectionArea,
            })
          }
        >
          Apply fields
        </button>
      </div>

      <div className="piece-bulk-group">
        <label className="piece-command-field" htmlFor="piece-bulk-hold-reason">
          Hold reason
          <input
            id="piece-bulk-hold-reason"
            className="piece-command-control"
            value={holdReason}
            disabled={!canBulkUpdate || pending}
            onChange={(event) => setHoldReason(event.target.value)}
            placeholder="Required to hold"
          />
        </label>
        <button
          type="button"
          className="cmd-btn"
          disabled={!canBulkUpdate || pending || !holdReason.trim()}
          onClick={() => onHold(holdReason.trim())}
        >
          Hold
        </button>
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          disabled={!canBulkUpdate || pending}
          onClick={onClearHold}
        >
          Clear hold
        </button>
      </div>

      <button
        type="button"
        onClick={onArchive}
        disabled={!canArchive || pending}
        title={
          canArchive
            ? "Archive selected pieces"
            : "Project admin access is required"
        }
        className="cmd-btn piece-selection-bar__archive"
      >
        <Archive size={15} />
        Archive selected
      </button>
    </div>
  );
}
