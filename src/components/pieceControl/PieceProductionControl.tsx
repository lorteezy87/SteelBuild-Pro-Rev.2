import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Factory,
  GitBranch,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import {
  advancePieceStation,
  fetchProductionSnapshot,
  setPieceHold,
  splitPieceLot,
  type LotAllocation,
} from '../../lib/pieceControl/productionRepository';
import {
  calculateWeightedProductionProgress,
  earnedPercentForPiece,
  groupPiecesByCurrentStation,
} from '../../lib/pieceControl/stationProgress';
import { toast } from 'sonner';
import { DecisionPanel } from '@/components/command';
import { presentPieceControlError } from '@/lib/pieceControl/errorPresentation';

const Button = ({ variant: _variant, size: _size, ...props }: any) => (
  <button type="button" {...props} />
);
const Input = (props: any) => <input {...props} />;

interface PieceProductionControlProps {
  projectId: string;
  pieceControlMode: string;
  workPackageId?: string;
}

const compactNumber = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

export function PieceProductionControl({
  projectId,
  pieceControlMode,
  workPackageId,
}: PieceProductionControlProps) {
  const queryClient = useQueryClient();
  const enabled = pieceControlMode !== 'off';
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [splitRows, setSplitRows] = useState<LotAllocation[]>([
    { lot_code: 'A', quantity: 0 },
    { lot_code: 'B', quantity: 0 },
  ]);
  const [overrideStationKey, setOverrideStationKey] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [holdReason, setHoldReason] = useState('');

  const snapshotQuery = useQuery({
    queryKey: ['piece-production', projectId, workPackageId ?? 'all'],
    queryFn: () => fetchProductionSnapshot(projectId, workPackageId),
    enabled,
  });
  const snapshot = snapshotQuery.data;
  const pieces = useMemo(
    () => snapshot?.pieces ?? [],
    [snapshot?.pieces],
  );
  const stations = snapshot?.stations ?? [];
  const completions = snapshot?.completions ?? [];
  const selectedPiece =
    pieces.find((piece) => piece.id === selectedPieceId) ??
    pieces.find((piece) => !piece.is_container) ??
    null;
  const grouped = useMemo(
    () => groupPiecesByCurrentStation(pieces),
    [pieces],
  );
  const progress = calculateWeightedProductionProgress(
    pieces,
    stations,
    completions,
  );

  const invalidateProduction = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['piece-production', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['piece-register', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['piece-relationships', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['canonical-release-gate'] }),
      queryClient.invalidateQueries({ queryKey: ['canonical-reporting', projectId] }),
    ]);
  };

  const splitMutation = useMutation({
    mutationFn: () => splitPieceLot(projectId, selectedPiece!.id, splitRows),
    onSuccess: async () => {
      toast.success('Piece lot split into production lots.');
      setSelectedPieceId(null);
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, 'The piece lot could not be split.'),
      ),
  });

  const advanceMutation = useMutation({
    mutationFn: ({
      stationKey,
      override,
      reason,
    }: {
      stationKey: string;
      override: boolean;
      reason?: string;
    }) =>
      advancePieceStation(
        projectId,
        selectedPiece!.id,
        stationKey,
        override,
        reason,
      ),
    onSuccess: async () => {
      toast.success('Production station recorded.');
      setOverrideStationKey(null);
      setOverrideReason('');
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          'The production station could not be recorded.',
        ),
      ),
  });

  const holdMutation = useMutation({
    mutationFn: ({ onHold, reason }: { onHold: boolean; reason?: string }) =>
      setPieceHold(projectId, [selectedPiece!.id], onHold, reason),
    onSuccess: async (_data, variables) => {
      toast.success(variables.onHold ? 'Hold applied.' : 'Hold released.');
      setHoldReason('');
      await invalidateProduction();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, 'The hold state could not be updated.'),
      ),
  });

  if (!enabled) {
    return (
      <section className="piece-operation-state">
        <h2 className="piece-operation-state__title">
          <Factory size={16} />
          Production
        </h2>
        <p>
          Production stations and lot splitting are unavailable until the Piece Register is set up.
        </p>
      </section>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <section className="piece-operation-state is-loading" aria-label="Loading production">
        <Loader2 size={20} className="piece-operation-spinner" />
      </section>
    );
  }

  if (snapshotQuery.error) {
    return (
      <section className="piece-operation-state is-error">
        <span>
          {presentPieceControlError(
            snapshotQuery.error,
            'Production data could not be loaded.',
          )}
        </span>
        <button
          type="button"
          className="cmd-btn cmd-btn--secondary"
          onClick={() => void snapshotQuery.refetch()}
        >
          Try again
        </button>
      </section>
    );
  }

  const selectedCompletions = selectedPiece
    ? completions.filter((completion) => completion.piece_id === selectedPiece.id)
    : [];
  const completedKeys = new Set(
    selectedCompletions.map((completion) => completion.station_key),
  );
  const nextStation = stations.find((station) => !completedKeys.has(station.station_key));
  const splitTotal = splitRows.reduce(
    (total, row) => total + (Number(row.quantity) || 0),
    0,
  );
  const normalizedLotCodes = splitRows.map((row) => row.lot_code.trim().toUpperCase());
  const splitValid =
    Boolean(selectedPiece) &&
    !selectedPiece!.is_container &&
    splitRows.length >= 2 &&
    splitRows.every(
      (row) =>
        row.lot_code.trim() &&
        row.lot_code.trim().toUpperCase() !== 'ALL' &&
        Number(row.quantity) > 0,
    ) &&
    new Set(normalizedLotCodes).size === normalizedLotCodes.length &&
    splitTotal === Number(selectedPiece!.quantity);
  const released =
    Boolean(selectedPiece?.work_package_id) &&
    snapshot!.canonicalReleaseWorkPackageIds.includes(selectedPiece!.work_package_id!);
  const stationDisabledReason = selectedPiece?.on_hold
    ? 'Release the hold before recording production.'
    : selectedPiece?.is_container
      ? 'Tracking rows are not physical piece lots.'
      : !released
        ? 'Work-package release required'
        : null;

  return (
    <section className="piece-operations">
      <header className="piece-operations__head">
        <div className="piece-operations__intro">
          <span className="piece-operations__icon" aria-hidden="true">
            <Factory size={17} />
          </span>
          <div>
            <h2>Production</h2>
            <p>Record controlled physical station transitions.</p>
            <p className="piece-operations__safety">
              Completed events cannot be overridden or reversed.
            </p>
          </div>
        </div>
        <div className="piece-operations__summary" aria-label="Production summary">
          <span>
            <small>Active lots</small>
            <strong>{pieces.filter((piece) => !piece.is_container).length}</strong>
          </span>
          <span>
            <small>Earned progress</small>
            <strong>{progress.toFixed(1)}%</strong>
          </span>
        </div>
      </header>

      {pieces.filter((piece) => !piece.is_container).length === 0 ? (
        <p className="piece-operation-empty">
          No active production lots are in this scope.
        </p>
      ) : (
        <div className="piece-production-board">
          <div className="piece-operations__grid">
            {[
              { key: 'not_started', name: 'Not Started' },
              ...stations.map((station) => ({
                key: station.station_key,
                name: station.station_name,
              })),
            ].map((column) => (
              <section key={column.key} className="piece-production-column">
                <header className="piece-production-column__head">
                  <h3>{column.name}</h3>
                  <span>{grouped[column.key as keyof typeof grouped]?.length ?? 0}</span>
                </header>
                <div className="piece-production-column__lots">
                  {(grouped[column.key as keyof typeof grouped] ?? []).map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      aria-pressed={selectedPiece?.id === piece.id}
                      onClick={() => setSelectedPieceId(piece.id)}
                      className={`piece-production-lot${
                        selectedPiece?.id === piece.id ? ' is-selected' : ''
                      }`}
                    >
                      <strong>
                        {piece.piece_mark} / {piece.lot_code}
                      </strong>
                      <span>Qty {compactNumber.format(Number(piece.quantity))}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {selectedPiece ? (
        <div className="piece-production-controls">
          <section className="piece-operation-card">
            <header className="piece-operation-card__head">
              <div>
                <span className="piece-operation-card__eyebrow">Station controls</span>
                <h3>
                  {selectedPiece.piece_mark} / {selectedPiece.lot_code}
                </h3>
                <p>
                  {earnedPercentForPiece(selectedPiece.id, stations, completions).toFixed(1)}%
                  earned
                </p>
              </div>
              {stationDisabledReason ? (
                <div className="piece-operation-prerequisite">
                  <ShieldAlert size={16} />
                  {stationDisabledReason}
                </div>
              ) : null}
            </header>

            <div className="piece-operation-hold" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <span className="piece-operation-card__eyebrow">Hold control</span>
              {selectedPiece.on_hold ? (
                <>
                  <p>
                    Held{selectedPiece.on_hold_reason ? `: ${selectedPiece.on_hold_reason}` : ''}
                  </p>
                  <Button
                    size="sm"
                    className="cmd-btn cmd-btn--secondary"
                    disabled={holdMutation.isPending || selectedPiece.is_container}
                    onClick={() => holdMutation.mutate({ onHold: false })}
                  >
                    Release hold
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    className="piece-command-control"
                    aria-label="Hold reason"
                    placeholder="Hold reason (required)"
                    value={holdReason}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setHoldReason(event.target.value)
                    }
                  />
                  <Button
                    size="sm"
                    className="cmd-btn"
                    disabled={
                      holdMutation.isPending ||
                      selectedPiece.is_container ||
                      !holdReason.trim()
                    }
                    onClick={() =>
                      holdMutation.mutate({ onHold: true, reason: holdReason.trim() })
                    }
                  >
                    Apply hold
                  </Button>
                </>
              )}
            </div>

            <div className="piece-production-stations">
              {stations.map((station) => {
                const completion = selectedCompletions.find(
                  (entry) => entry.station_key === station.station_key,
                );
                const isNext = nextStation?.station_key === station.station_key;
                return (
                  <div
                    key={station.id}
                    className={`piece-production-station${
                      completion ? ' is-complete' : ''
                    }`}
                  >
                    <div className="piece-production-station__identity">
                      <span className="piece-production-station__number">
                        {completion ? <Check size={15} /> : station.sort_order}
                      </span>
                      <span>
                        <strong>{station.station_name}</strong>
                        <small>
                          {station.earned_percent}% earned
                          {completion?.is_override ? ' · override' : ''}
                        </small>
                      </span>
                    </div>
                    {!completion ? (
                      <Button
                        size="sm"
                        variant={isNext ? 'default' : 'outline'}
                        className={`cmd-btn${isNext ? ' cmd-btn--primary' : ''}`}
                        disabled={
                          advanceMutation.isPending ||
                          selectedPiece.on_hold ||
                          selectedPiece.is_container ||
                          !released
                        }
                        onClick={() => {
                          if (isNext) {
                            advanceMutation.mutate({
                              stationKey: station.station_key,
                              override: false,
                            });
                          } else {
                            setOverrideStationKey(station.station_key);
                          }
                        }}
                      >
                        {isNext ? 'Complete' : 'Override'}
                        <ChevronRight size={14} />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {overrideStationKey ? (
              <div className="piece-operation-warning">
                <div className="piece-operation-warning__title">
                  <AlertTriangle size={16} />
                  Out-of-sequence confirmation
                </div>
                <p>
                  The server will preserve missing prior stations as incomplete and record this
                  exception permanently.
                </p>
                <Input
                  className="piece-command-control"
                  aria-label="Override reason"
                  value={overrideReason}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setOverrideReason(event.target.value)
                  }
                  placeholder="Required override reason"
                />
                <div className="piece-command-actions">
                  <Button
                    size="sm"
                    className="cmd-btn cmd-btn--primary"
                    disabled={!overrideReason.trim() || advanceMutation.isPending}
                    onClick={() =>
                      advanceMutation.mutate({
                        stationKey: overrideStationKey,
                        override: true,
                        reason: overrideReason,
                      })
                    }
                  >
                    Confirm override
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cmd-btn"
                    onClick={() => {
                      setOverrideStationKey(null);
                      setOverrideReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="piece-operation-card piece-production-split">
            <header className="piece-operation-card__head">
              <div>
                <span className="piece-operation-card__eyebrow">Lot control</span>
                <h3 className="piece-operation-card__title-with-icon">
                  <GitBranch size={16} />
                  Split this lot
                </h3>
              </div>
            </header>
            <p className="piece-production-split__copy">
              Splitting converts this row into a tracking record and creates physical production
              lots. The tracking record remains for traceability but does not count toward quantity,
              tonnage, release scope, or production progress.
            </p>
            <div className="piece-production-split__rows">
              {splitRows.map((row, index) => (
                <div key={index} className="piece-production-split__row">
                  <Input
                    className="piece-command-control"
                    aria-label={`Child lot ${index + 1} code`}
                    value={row.lot_code}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSplitRows((current) =>
                        current.map((entry, rowIndex) =>
                          rowIndex === index
                            ? { ...entry, lot_code: event.target.value.toUpperCase() }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Lot"
                  />
                  <Input
                    className="piece-command-control"
                    aria-label={`Child lot ${index + 1} quantity`}
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity || ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSplitRows((current) =>
                        current.map((entry, rowIndex) =>
                          rowIndex === index
                            ? { ...entry, quantity: Number(event.target.value) }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Quantity"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cmd-btn"
                    disabled={splitRows.length <= 2}
                    onClick={() =>
                      setSplitRows((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="cmd-btn piece-production-split__add"
              onClick={() =>
                setSplitRows((current) => [
                  ...current,
                  { lot_code: '', quantity: 0 },
                ])
              }
            >
              Add child lot
            </Button>
            <div
              className={`piece-production-allocation${
                splitTotal === Number(selectedPiece.quantity) ? ' is-valid' : ''
              }`}
            >
              Allocated {compactNumber.format(splitTotal)} of{' '}
              {compactNumber.format(Number(selectedPiece.quantity))}
            </div>
            <Button
              className="cmd-btn cmd-btn--primary piece-production-split__submit"
              disabled={!splitValid || splitMutation.isPending}
              onClick={() => splitMutation.mutate()}
            >
              {splitMutation.isPending ? (
                <Loader2 size={16} className="piece-operation-spinner" />
              ) : null}
              Split lot
            </Button>
          </section>
        </div>
      ) : null}

      <DecisionPanel title="Production history">
        {!selectedPiece ? (
          <p className="piece-operation-empty">
            Select a piece lot to inspect its immutable station history.
          </p>
        ) : (
          <div className="piece-operation-history">
            <div className="piece-operation-history__intro">
              <div>
                <strong>
                  {selectedPiece.piece_mark} / {selectedPiece.lot_code}
                </strong>
                <span>{selectedCompletions.length} completed stations</span>
              </div>
              <p>Station completions are read-only.</p>
            </div>
            {selectedCompletions.length === 0 ? (
              <p className="piece-operation-empty is-compact">
                No production station events recorded.
              </p>
            ) : (
              <div className="piece-operation-history__list">
                {selectedCompletions.map((completion) => (
                  <div key={completion.id} className="piece-operation-history__row">
                    <span className="piece-operation-history__status">
                      <Check size={14} />
                    </span>
                    <span>
                      <strong>{completion.station_name}</strong>
                      <small>
                        {completion.earned_percent}% earned
                        {completion.is_override ? ' · override' : ''}
                      </small>
                    </span>
                    <time dateTime={completion.completed_at}>
                      {new Date(completion.completed_at).toLocaleString()}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DecisionPanel>
    </section>
  );
}
