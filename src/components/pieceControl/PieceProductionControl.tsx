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
  splitPieceLot,
  type LotAllocation,
} from '../../lib/pieceControl/productionRepository';
import {
  calculateWeightedProductionProgress,
  earnedPercentForPiece,
  groupPiecesByCurrentStation,
} from '../../lib/pieceControl/stationProgress';
import { toast } from 'sonner';

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

  const snapshotQuery = useQuery({
    queryKey: ['piece-production', projectId, workPackageId ?? 'all'],
    queryFn: () => fetchProductionSnapshot(projectId, workPackageId),
    enabled,
  });
  const snapshot = snapshotQuery.data;
  const pieces = snapshot?.pieces ?? [];
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
      toast.success('Piece lot split into actionable child lots.');
      setSelectedPieceId(null);
      await invalidateProduction();
    },
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });

  if (!enabled) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <Factory className="h-4 w-4" />
          Canonical production
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Production stations and lot splitting are disabled while Piece Control is off.
        </p>
      </section>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <section className="flex min-h-32 items-center justify-center rounded-xl border border-slate-200">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </section>
    );
  }

  if (snapshotQuery.error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Unable to load canonical production: {(snapshotQuery.error as Error).message}
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

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Factory className="h-4 w-4 text-amber-600" />
            Canonical production
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Active leaf lots only. Earned progress is weight-based and excludes roll-up containers.
          </p>
        </div>
        <div className="rounded-lg bg-slate-900 px-4 py-2 text-right text-white">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Earned progress
          </div>
          <div className="text-xl font-semibold">{progress.toFixed(1)}%</div>
        </div>
      </div>

      {pieces.filter((piece) => !piece.is_container).length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No actionable canonical piece lots are in this scope.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {[
              { key: 'not_started', name: 'Not Started' },
              ...stations.map((station) => ({
                key: station.station_key,
                name: station.station_name,
              })),
            ].map((column) => (
              <div key={column.key} className="rounded-lg bg-slate-50 p-2">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{column.name}</span>
                  <span>{grouped[column.key as keyof typeof grouped]?.length ?? 0}</span>
                </div>
                <div className="space-y-2">
                  {(grouped[column.key as keyof typeof grouped] ?? []).map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      onClick={() => setSelectedPieceId(piece.id)}
                      className={`w-full rounded-md border p-2 text-left text-xs transition ${
                        selectedPiece?.id === piece.id
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">
                        {piece.piece_mark} / {piece.lot_code}
                      </div>
                      <div className="mt-1 text-slate-500">
                        Qty {compactNumber.format(Number(piece.quantity))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPiece && (
        <div className="grid gap-5 border-t border-slate-200 pt-5 xl:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {selectedPiece.piece_mark} / {selectedPiece.lot_code}
                </h3>
                <p className="text-sm text-slate-500">
                  {earnedPercentForPiece(selectedPiece.id, stations, completions).toFixed(1)}%
                  earned
                </p>
              </div>
              {!released && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <ShieldAlert className="h-4 w-4" />
                  Canonical work-package release required
                </div>
              )}
            </div>

            <div className="space-y-2">
              {stations.map((station) => {
                const completion = selectedCompletions.find(
                  (entry) => entry.station_key === station.station_key,
                );
                const isNext = nextStation?.station_key === station.station_key;
                return (
                  <div
                    key={station.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${
                          completion
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {completion ? <Check className="h-4 w-4" /> : station.sort_order}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {station.station_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {station.earned_percent}% earned
                          {completion?.is_override ? ' · override' : ''}
                        </div>
                      </div>
                    </div>
                    {!completion && (
                      <Button
                        size="sm"
                        variant={isNext ? 'default' : 'outline'}
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
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {overrideStationKey && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Out-of-sequence confirmation
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  The server will preserve missing prior stations as incomplete and record this
                  exception permanently.
                </p>
                <Input
                  className="mt-3 bg-white"
                  value={overrideReason}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setOverrideReason(event.target.value)
                  }
                  placeholder="Required override reason"
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
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
                    onClick={() => {
                      setOverrideStationKey(null);
                      setOverrideReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg bg-slate-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <GitBranch className="h-4 w-4" />
              Split this lot
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Splitting converts this row into a roll-up container and creates actionable child
              lots. The container remains for traceability but does not count toward quantity,
              tonnage, release scope, or production progress.
            </p>
            {splitRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
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
            <Button
              variant="outline"
              size="sm"
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
              className={`text-xs ${
                splitTotal === Number(selectedPiece.quantity)
                  ? 'text-emerald-700'
                  : 'text-slate-500'
              }`}
            >
              Allocated {compactNumber.format(splitTotal)} of{' '}
              {compactNumber.format(Number(selectedPiece.quantity))}
            </div>
            <Button
              className="w-full"
              disabled={!splitValid || splitMutation.isPending}
              onClick={() => splitMutation.mutate()}
            >
              {splitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Split lot
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
