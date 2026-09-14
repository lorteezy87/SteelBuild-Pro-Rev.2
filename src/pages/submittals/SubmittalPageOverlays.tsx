import type { ComponentType, PropsWithChildren } from "react";
import { BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import DeleteDialog from "@/components/shared/DeleteDialog";
import SubmittalBulkEditModal from "@/components/submittals/SubmittalBulkEditModal";
import SubmittalBulkAddModal from "@/components/submittals/SubmittalBulkAddModal";
import NewRoundModalRaw from "@/components/submittals/NewRoundModal";
import ReleaseGateOverrideModalRaw from "@/components/submittals/ReleaseGateOverrideModal";
import SheetResponseGridRaw from "@/components/submittals/SheetResponseGrid";
import { Dialog, DialogContent } from "./uiCompat";
import type { NewRoundCarrySeed } from "./submittalAdvanceHelpers";
import type { ReleaseBlock } from "./useSubmittalsPageMutations";
import type {
  SubmittalDrawingRecord,
  SubmittalSheetResponseRecord,
} from "./useSubmittalsPageQueries";
import type { Submittal, SubmittalRoundRecord } from "./types";

type CompatProps = PropsWithChildren<Record<string, unknown>>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<CompatProps>;
const NewRoundModal = NewRoundModalRaw as unknown as ComponentType<CompatProps>;
const ReleaseGateOverrideModal =
  ReleaseGateOverrideModalRaw as unknown as ComponentType<CompatProps>;
const SheetResponseGrid = SheetResponseGridRaw as unknown as ComponentType<CompatProps>;

export interface SubmittalPageOverlaysProps {
  selectedIds: Set<string>;
  canEdit: boolean;
  canDelete: boolean;
  onClearSelection: () => void;
  onOpenBulkEdit: () => void;
  onOpenBulkDelete: () => void;
  showBulkEdit: boolean;
  onCloseBulkEdit: () => void;
  bulkEditPending: boolean;
  onBulkEdit: (data: Record<string, unknown>) => Promise<unknown>;
  showBulkAdd: boolean;
  onCloseBulkAdd: () => void;
  bulkAddPending: boolean;
  onBulkAdd: (rows: Record<string, unknown>[]) => void;
  showBulkDelete: boolean;
  onCloseBulkDelete: () => void;
  bulkDeletePending: boolean;
  onBulkDelete: () => Promise<unknown>;
  showNewRound: boolean;
  selected: Submittal | null;
  newRoundSeed: NewRoundCarrySeed | null;
  createRoundPending: boolean;
  onCloseNewRound: () => void;
  onCreateRound: (data: Record<string, unknown>) => Promise<unknown>;
  releaseBlock: ReleaseBlock | null;
  advancePending: boolean;
  onCloseReleaseBlock: () => void;
  onReleaseOverride: (reason: string) => void;
  sheetResponseRound: SubmittalRoundRecord | null;
  drawings: SubmittalDrawingRecord[];
  sheetResponses: SubmittalSheetResponseRecord[];
  saveSheetResponsesPending: boolean;
  onCloseSheetResponses: () => void;
  onSaveSheetResponses: (args: {
    roundId: string;
    responses: Record<string, unknown>[];
  }) => Promise<unknown>;
}

export default function SubmittalPageOverlays({
  selectedIds,
  canEdit,
  canDelete,
  onClearSelection,
  onOpenBulkEdit,
  onOpenBulkDelete,
  showBulkEdit,
  onCloseBulkEdit,
  bulkEditPending,
  onBulkEdit,
  showBulkAdd,
  onCloseBulkAdd,
  bulkAddPending,
  onBulkAdd,
  showBulkDelete,
  onCloseBulkDelete,
  bulkDeletePending,
  onBulkDelete,
  showNewRound,
  selected,
  newRoundSeed,
  createRoundPending,
  onCloseNewRound,
  onCreateRound,
  releaseBlock,
  advancePending,
  onCloseReleaseBlock,
  onReleaseOverride,
  sheetResponseRound,
  drawings,
  sheetResponses,
  saveSheetResponsesPending,
  onCloseSheetResponses,
  onSaveSheetResponses,
}: SubmittalPageOverlaysProps) {
  return (
    <>
      <BulkActionBar
        count={selectedIds.size}
        onClear={onClearSelection}
        actions={[
          ...(canEdit ? [{
            label: "EDIT SELECTED",
            icon: "edit",
            onClick: onOpenBulkEdit,
          }] : []),
          ...(canDelete ? [{
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: onOpenBulkDelete,
          }] : []),
        ]}
      />

      <SubmittalBulkEditModal
        open={showBulkEdit}
        count={selectedIds.size}
        onCancel={onCloseBulkEdit}
        busy={bulkEditPending}
        onSubmit={onBulkEdit}
      />

      <SubmittalBulkAddModal
        open={showBulkAdd}
        onCancel={onCloseBulkAdd}
        busy={bulkAddPending}
        onSubmit={onBulkAdd}
      />

      <DeleteDialog
        open={showBulkDelete}
        onClose={onCloseBulkDelete}
        busy={bulkDeletePending}
        onConfirm={onBulkDelete}
        title={`Delete ${selectedIds.size} submittal${selectedIds.size === 1 ? "" : "s"}`}
        description={`Soft-delete ${selectedIds.size} selected submittal${selectedIds.size === 1 ? "" : "s"}? This cannot be undone from the UI.`}
      />

      {showNewRound && selected && newRoundSeed && (
        <NewRoundModal
          open={showNewRound}
          submittal={selected}
          previousRound={newRoundSeed.previousRound}
          carryItems={newRoundSeed.carryItems}
          carryFromRound={newRoundSeed.carryFromRound}
          seededNotes={newRoundSeed.seededNotes}
          busy={createRoundPending}
          onClose={onCloseNewRound}
          onSubmit={onCreateRound}
        />
      )}

      <ReleaseGateOverrideModal
        open={!!releaseBlock}
        blockingRfiNumbers={releaseBlock?.rfis || []}
        busy={advancePending}
        onClose={onCloseReleaseBlock}
        onConfirm={onReleaseOverride}
      />

      {sheetResponseRound && (
        <Dialog open onOpenChange={(open: boolean) => !open && onCloseSheetResponses()}>
          <DialogContent className="sm:max-w-[900px]" style={{ padding: 0 }}>
            <SheetResponseGrid
              round={sheetResponseRound}
              drawings={drawings.filter((drawing) => {
                const setIds = sheetResponseRound.drawing_set_ids || [];
                return drawing.drawing_set_id
                  ? setIds.includes(drawing.drawing_set_id)
                  : false;
              })}
              existingResponses={sheetResponses.filter(
                (response) => response.submittal_round_id === sheetResponseRound.id,
              )}
              onSave={(responses: Record<string, unknown>[]) =>
                sheetResponseRound.id
                  ? onSaveSheetResponses({
                      roundId: sheetResponseRound.id,
                      responses,
                    })
                  : Promise.resolve()
              }
              saving={saveSheetResponsesPending}
              onClose={onCloseSheetResponses}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
