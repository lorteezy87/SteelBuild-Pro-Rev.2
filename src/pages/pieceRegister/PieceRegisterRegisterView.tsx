import type { Dispatch, SetStateAction } from "react";
/**
 * Register view: filter bar + table + bulk actions + impact panel.
 * Presentational extract from PieceRegister.tsx (behavior-preserving).
 */
import { PackageOpen, Search } from "lucide-react";
import PieceRegisterBulkBar, {
  type BulkAttributeFormValues,
} from "@/components/pieceControl/PieceRegisterBulkBar";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import type { PieceDigitalThreadModel } from "@/lib/pieceControl/pieceIntelligenceTypes";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import {
  nextPieceRegisterSort,
  type PieceRegisterSort,
} from "@/lib/pieceControl/pieceRegisterSort";
import type { PieceAttentionItem } from "@/lib/pieceControl/presentation";
import { pieceTons } from "@/lib/pieceControl/tonnage";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";
import type {
  PieceRegisterDisplayRow,
  PieceRegisterFilters,
} from "./filter";
import { PieceDigitalThread } from "./PieceDigitalThread";
import { SelectFilter } from "./SelectFilter";


const PIECE_LIFECYCLE_ORDER = [
  "not_started",
  "released",
  "in_fabrication",
  "fabricated",
  "shipped",
  "delivered",
  "erected",
] as const;

function lifecycleReached(status: string, target: string): boolean {
  const current = PIECE_LIFECYCLE_ORDER.indexOf(status as (typeof PIECE_LIFECYCLE_ORDER)[number]);
  const goal = PIECE_LIFECYCLE_ORDER.indexOf(target as (typeof PIECE_LIFECYCLE_ORDER)[number]);
  return current >= 0 && goal >= 0 && current >= goal;
}

function metadataText(piece: PieceRegisterDisplayRow, ...keys: string[]): string | null {
  const metadata = piece.metadata ?? {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function StageCell({
  done,
  activeLabel,
  active = false,
}: {
  done: boolean;
  activeLabel?: string;
  active?: boolean;
}) {
  if (done) return <span className="cmd-pill cmd-pill--good">Done</span>;
  if (active && activeLabel) return <span className="cmd-pill cmd-pill--info">{activeLabel}</span>;
  return <span className="piece-register-cell-meta">—</span>;
}

export type PieceRegisterWorkPackageOption = {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  package_name?: string | null;
};

export type PieceRegisterRegisterViewProps = {
  filters: PieceRegisterFilters;
  updateRegisterFilters: (patch: Partial<PieceRegisterFilters>) => void;
  workPackages: PieceRegisterWorkPackageOption[];
  profiles: string[];
  grades: string[];
  lifecycles: string[];
  sources: string[];
  attentionFocus: PieceAttentionItem["key"] | null;
  clearRegisterFilters: () => void;
  filteredRows: PieceRegisterDisplayRow[];
  displayRows: PieceRegisterDisplayRow[];
  registerSort: PieceRegisterSort;
  setRegisterSort: Dispatch<SetStateAction<PieceRegisterSort>>;
  selectedPieceIds: Set<string>;
  setSelectedPieceIds: Dispatch<SetStateAction<Set<string>>>;
  canBulkUpdate: boolean;
  canArchive: boolean;
  bulkPending: boolean;
  onBulkAssign: (workPackageId: string) => void;
  onBulkUnassign: () => void;
  onBulkAttrs: (values: BulkAttributeFormValues) => void;
  onBulkHold: (payload: { onHold: boolean; reason?: string }) => void;
  onArchive: () => void;
  selectedPieceId: string | null;
  selectedPieceThread: PieceDigitalThreadModel | null;
  intelligenceLoading: boolean;
  intelligenceError: unknown;
  onRetryIntelligence: () => void;
  onClosePiece: () => void;
  onOpenRelationships: () => void;
  onOpenRelease: () => void;
  allFilteredSelected: boolean;
  toggleAllFiltered: () => void;
  piecesLoading: boolean;
  piecesError: unknown;
  onRetryPieces: () => void;
  onGoImport: () => void;
};

export function PieceRegisterRegisterView(props: PieceRegisterRegisterViewProps) {
  const {
    filters,
    updateRegisterFilters,
    workPackages,
    profiles,
    grades,
    lifecycles,
    sources,
    attentionFocus,
    clearRegisterFilters,
    filteredRows,
    displayRows,
    registerSort,
    setRegisterSort,
    selectedPieceIds,
    setSelectedPieceIds,
    canBulkUpdate,
    canArchive,
    bulkPending,
    onBulkAssign,
    onBulkUnassign,
    onBulkAttrs,
    onBulkHold,
    onArchive,
    selectedPieceId,
    selectedPieceThread,
    intelligenceLoading,
    intelligenceError,
    onRetryIntelligence,
    onClosePiece,
    onOpenRelationships,
    onOpenRelease,
    allFilteredSelected,
    toggleAllFiltered,
    piecesLoading,
    piecesError,
    onRetryPieces,
    onGoImport,
  } = props;

  return (
    <section className="piece-register-workspace">
      <div className="cmd-filterbar piece-register-filters">
        <label
          htmlFor="piece-register-search"
          className="piece-register-filter piece-register-filter--search"
        >
          Search
          <span className="cmd-search">
            <Search size={15} />
            <input
              id="piece-register-search"
              value={filters.search}
              onChange={(event) =>
                updateRegisterFilters({ search: event.target.value })
              }
              placeholder="Mark, package, profile..."
              className="cmd-search__input"
            />
          </span>
        </label>
        <SelectFilter
          label="Work package"
          value={filters.workPackageId}
          onChange={(value) => updateRegisterFilters({ workPackageId: value })}
          options={workPackages.map((wp) => ({
            value: wp.id,
            label: formatWorkPackageTitle(wp),
          }))}
        />
        <SelectFilter
          label="Profile"
          value={filters.profile}
          onChange={(value) => updateRegisterFilters({ profile: value })}
          options={profiles}
        />
        <SelectFilter
          label="Grade"
          value={filters.grade}
          onChange={(value) => updateRegisterFilters({ grade: value })}
          options={grades}
        />
        <SelectFilter
          label="Lifecycle"
          value={filters.lifecycle}
          onChange={(value) => updateRegisterFilters({ lifecycle: value })}
          options={lifecycles}
        />
        <SelectFilter
          label="Source"
          value={filters.source}
          onChange={(value) => updateRegisterFilters({ source: value })}
          options={sources}
        />
        <label htmlFor="piece-register-filter-hold" className="piece-register-filter">
          Hold
          <select
            id="piece-register-filter-hold"
            value={filters.hold}
            onChange={(event) =>
              updateRegisterFilters({
                hold: event.target.value as PieceRegisterFilters["hold"],
              })
            }
            className="piece-register-filter__control"
          >
            <option value="all">All</option>
            <option value="held">Held</option>
            <option value="clear">Clear</option>
          </select>
        </label>
        {attentionFocus ? (
          <button
            type="button"
            className="cmd-chip-btn is-active piece-register-attention-filter"
            onClick={clearRegisterFilters}
          >
            {attentionFocus === "unassigned"
              ? "Unassigned pieces"
              : attentionFocus === "missing-weight"
                ? "Missing weights"
                : "Held pieces"}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      <div className="piece-register-table">
        <div className="piece-register-table__head">
          <div>
            <h2>Piece register</h2>
            <p>
              {filteredRows.length} of {displayRows.length} rows shown
            </p>
          </div>
          <div className="piece-register-table__head-actions">
            <label className="piece-register-filter" htmlFor="piece-register-sort">
              Sort by
              <select
                id="piece-register-sort"
                className="piece-register-filter__control"
                value={`${registerSort.key}:${registerSort.direction}`}
                onChange={(event) => {
                  const [key, direction] = event.target.value.split(":") as [
                    PieceRegisterSort["key"],
                    PieceRegisterSort["direction"],
                  ];
                  setRegisterSort({ key, direction });
                }}
              >
                <option value="work_package:asc">Work package (A→Z)</option>
                <option value="work_package:desc">Work package (Z→A)</option>
                <option value="mark:asc">Mark (A→Z)</option>
                <option value="mark:desc">Mark (Z→A)</option>
                <option value="updated_at:desc">Last update (newest)</option>
                <option value="updated_at:asc">Last update (oldest)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={clearRegisterFilters}
              className="cmd-btn cmd-btn--ghost"
            >
              Clear filters
            </button>
          </div>
        </div>

        {selectedPieceIds.size > 0 ? (
          <PieceRegisterBulkBar
            selectedCount={selectedPieceIds.size}
            workPackages={workPackages}
            canBulkUpdate={canBulkUpdate}
            canArchive={canArchive}
            pending={bulkPending}
            onAssign={onBulkAssign}
            onUnassign={onBulkUnassign}
            onApplyAttributes={onBulkAttrs}
            onHold={(reason) => onBulkHold({ onHold: true, reason })}
            onClearHold={() => onBulkHold({ onHold: false })}
            onArchive={onArchive}
          />
        ) : null}

        {selectedPieceId && intelligenceLoading ? (
          <div className="piece-operation-state is-loading" aria-label="Loading piece digital thread">
            Loading the piece digital thread…
          </div>
        ) : null}
        {selectedPieceId && intelligenceError ? (
          <div className="piece-operation-state is-error">
            <strong>Piece evidence could not be loaded.</strong>
            <p>
              {presentPieceControlError(
                intelligenceError,
                "Piece evidence is unavailable.",
              )}
            </p>
            <button
              type="button"
              className="cmd-btn cmd-btn--secondary"
              onClick={onRetryIntelligence}
            >
              Try again
            </button>
          </div>
        ) : null}
        {selectedPieceId && !intelligenceLoading && !intelligenceError ? (
          selectedPieceThread ? (
            <PieceDigitalThread
              thread={selectedPieceThread}
              onClose={onClosePiece}
              onOpenRelationships={onOpenRelationships}
              onOpenRelease={onOpenRelease}
            />
          ) : (
            <div className="piece-operation-state is-error">
              Piece evidence is unavailable for this selection.
            </div>
          )
        ) : null}

        <div className="cmd-table-wrap piece-register-table__wrap">
          <table className="cmd-table piece-register-table__table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all visible pieces"
                    checked={allFilteredSelected}
                    disabled={!canBulkUpdate || filteredRows.length === 0}
                    onChange={toggleAllFiltered}
                    className="cmd-check"
                  />
                </th>
                {(
                  [
                    { label: "Piece Mark", key: "mark" as const },
                    { label: "Qty", key: null },
                    { label: "Main Mark", key: null },
                    { label: "Shape", key: null },
                    { label: "Weight", key: null },
                    { label: "WP", key: "work_package" as const },
                    { label: "Sequence", key: null },
                    { label: "Drawing", key: null },
                    { label: "Release", key: null },
                    { label: "Fab", key: null },
                    { label: "Load", key: null },
                    { label: "Ship", key: null },
                    { label: "Erect", key: null },
                  ] as const
                ).map((column) => (
                  <th key={column.label}>
                    {column.key ? (
                      <button
                        type="button"
                        className="piece-register-sort-th"
                        onClick={() =>
                          setRegisterSort((current) =>
                            nextPieceRegisterSort(current, column.key!),
                          )
                        }
                      >
                        {column.label}
                        {registerSort.key === column.key
                          ? registerSort.direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {piecesLoading && (
                <tr>
                  <td colSpan={14} className="cmd-table__empty">
                    Loading the project piece register...
                  </td>
                </tr>
              )}
              {piecesError ? (
                <tr>
                  <td colSpan={14} className="cmd-table__empty">
                    <strong className="piece-register-error">
                      The Piece Register could not be loaded.
                    </strong>
                    <div>
                      {presentPieceControlError(
                        piecesError,
                        "Piece Register data could not be loaded.",
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onRetryPieces}
                      className="cmd-btn"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : null}
              {!piecesLoading &&
                !piecesError &&
                filteredRows.map((piece) => {
                  const tons = pieceTons(piece);
                  return (
                    <tr key={piece.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${piece.piece_mark} lot ${piece.lot_code}`}
                          checked={selectedPieceIds.has(piece.id)}
                          disabled={!canBulkUpdate}
                          onChange={() =>
                            setSelectedPieceIds((current) => {
                              const next = new Set(current);
                              if (next.has(piece.id)) next.delete(piece.id);
                              else next.add(piece.id);
                              return next;
                            })
                          }
                          className="cmd-check"
                        />
                      </td>
                      <td className="piece-register-sticky piece-register-sticky--mark">
                        <div className="piece-register-mark">{piece.piece_mark}</div>
                        <div className="piece-register-cell-meta">
                          {piece.on_hold
                            ? "Held"
                            : piece.parent_piece_id
                              ? `Child lot ${piece.lot_code}`
                              : piece.is_container
                                ? `Container ${piece.lot_code}`
                                : piece.lot_code === "ALL"
                                  ? "Root lot ALL"
                                  : `Lot ${piece.lot_code}`}
                        </div>
                      </td>
                      <td className="piece-register-number">{piece.quantity}</td>
                      <td>
                        <div>{metadataText(piece, "main_mark", "assembly_mark") || (piece.parent_piece_id ? piece.parent_piece_id.slice(0, 8) : piece.piece_mark)}</div>
                        <div className="piece-register-cell-meta">{piece.parent_piece_id ? "Parent" : "Main"}</div>
                      </td>
                      <td>
                        <div>{piece.profile || "—"}</div>
                        <div className="piece-register-cell-meta">{piece.material_grade || "Grade unknown"}</div>
                      </td>
                      <td className="piece-register-number">
                        <div>{piece.weight_total_lbs == null ? "—" : `${Number(piece.weight_total_lbs).toFixed(0)} lb`}</div>
                        <div className="piece-register-cell-meta">{tons == null ? "Tons unknown" : `${tons.toFixed(3)} T`}</div>
                      </td>
                      <td>{piece.workPackageLabel}</td>
                      <td>
                        <div>{piece.sequence_number || "—"}</div>
                        <div className="piece-register-cell-meta">{piece.erection_area || ""}</div>
                      </td>
                      <td>
                        <div>{metadataText(piece, "drawing_number", "drawing_no", "sheet_number") || "—"}</div>
                        <div className="piece-register-cell-meta">{metadataText(piece, "drawing_set_name") || ""}</div>
                      </td>
                      <td>
                        {piece.on_hold ? (
                          <span className="cmd-pill cmd-pill--danger">Held</span>
                        ) : (
                          <StageCell done={lifecycleReached(piece.lifecycle_status, "released")} />
                        )}
                      </td>
                      <td>
                        <StageCell
                          done={lifecycleReached(piece.lifecycle_status, "fabricated")}
                          active={piece.lifecycle_status === "in_fabrication"}
                          activeLabel="In Fab"
                        />
                      </td>
                      <td>
                        <div>{metadataText(piece, "load_number", "load_no") || "—"}</div>
                        <div className="piece-register-cell-meta">{metadataText(piece, "trailer_number", "carrier") || ""}</div>
                      </td>
                      <td>
                        <StageCell done={lifecycleReached(piece.lifecycle_status, "shipped")} />
                      </td>
                      <td>
                        <StageCell done={lifecycleReached(piece.lifecycle_status, "erected")} />
                        <div className="piece-register-cell-meta">{pieceLifecycleLabel(piece.lifecycle_status)}</div>
                      </td>
                    </tr>
                  );
                })}
              {!piecesLoading && !piecesError && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="cmd-table__empty">
                    <PackageOpen size={28} />
                    <strong>
                      {displayRows.length === 0
                        ? "No pieces have been imported yet."
                        : "No pieces match these filters."}
                    </strong>
                    <button
                      type="button"
                      onClick={() =>
                        displayRows.length === 0
                          ? onGoImport()
                          : clearRegisterFilters()
                      }
                      className="cmd-btn cmd-btn--primary"
                    >
                      {displayRows.length === 0
                        ? "Import pieces"
                        : "Clear filters"}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
