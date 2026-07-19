import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Construction, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  logisticsDisabledReason,
  pieceLifecycleLabel,
  requiredLifecycleForAction,
  type LogisticsAction,
} from "@/lib/pieceControl/lifecycle";
import {
  fetchLogisticsSnapshot,
  transitionPieceLots,
} from "@/lib/pieceControl/logisticsRepository";

const Button = ({ variant: _variant, size: _size, ...props }: any) => (
  <button type="button" {...props} />
);
const Input = (props: any) => <input {...props} />;

interface PieceLogisticsControlProps {
  projectId: string;
  pieceControlMode: string;
  workPackageId?: string;
}

const actionDefinitions = {
  ship: {
    label: "Ship selected lots",
    pastLabel: "Shipped",
    icon: Truck,
    fields: [
      ["shipment_number", "Shipment / load number"],
      ["carrier", "Carrier"],
      ["destination", "Destination"],
    ],
  },
  deliver: {
    label: "Deliver selected lots",
    pastLabel: "Delivered",
    icon: PackageCheck,
    fields: [
      ["proof_of_delivery", "POD reference"],
      ["received_by", "Received by"],
      ["destination", "Delivery location"],
    ],
  },
  erect: {
    label: "Erect selected lots",
    pastLabel: "Erected",
    icon: Construction,
    fields: [
      ["erection_location", "Erection location"],
      ["erection_reference", "Erection reference"],
    ],
  },
} as const;

export function PieceLogisticsControl({
  projectId,
  pieceControlMode,
  workPackageId,
}: PieceLogisticsControlProps) {
  const enabled = pieceControlMode !== "off";
  const queryClient = useQueryClient();
  const [selectedByAction, setSelectedByAction] = useState<Record<LogisticsAction, string[]>>({
    ship: [],
    deliver: [],
    erect: [],
  });
  const [referenceByAction, setReferenceByAction] = useState<
    Record<LogisticsAction, Record<string, string>>
  >({ ship: {}, deliver: {}, erect: {} });
  const [historyPieceId, setHistoryPieceId] = useState<string | null>(null);

  const snapshotQuery = useQuery({
    queryKey: ["piece-logistics", projectId, workPackageId ?? "all"],
    queryFn: () => fetchLogisticsSnapshot(projectId, workPackageId),
    enabled,
  });
  const pieces = snapshotQuery.data?.pieces ?? [];
  const events = snapshotQuery.data?.events ?? [];
  const leafPieces = useMemo(
    () => pieces.filter((piece) => !piece.is_container),
    [pieces],
  );

  const transitionMutation = useMutation({
    mutationFn: ({ action }: { action: LogisticsAction }) =>
      transitionPieceLots(
        action,
        projectId,
        selectedByAction[action],
        referenceByAction[action],
      ),
    onSuccess: async (_, variables) => {
      toast.success(`${actionDefinitions[variables.action].pastLabel} canonical piece lots.`);
      setSelectedByAction((current) => ({ ...current, [variables.action]: [] }));
      setReferenceByAction((current) => ({ ...current, [variables.action]: {} }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["piece-logistics", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-production", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["canonical-reporting", projectId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!enabled) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="font-semibold text-slate-700">Canonical logistics</div>
        <p className="mt-2 text-sm text-slate-500">
          Shipment, delivery, and erection actions are disabled while Piece Control is off.
        </p>
      </section>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <section className="flex min-h-28 items-center justify-center rounded-xl border border-slate-200">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </section>
    );
  }

  if (snapshotQuery.error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Unable to load canonical logistics: {(snapshotQuery.error as Error).message}
      </section>
    );
  }

  const historyPiece = pieces.find((piece) => piece.id === historyPieceId);
  const history = events.filter((event) => event.piece_id === historyPieceId);

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-sky-700" />
          Immutable downstream logistics
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Each batch is atomic. Physical transitions cannot be overridden or reversed.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(Object.keys(actionDefinitions) as LogisticsAction[]).map((action) => {
          const definition = actionDefinitions[action];
          const Icon = definition.icon;
          const requiredStatus = requiredLifecycleForAction(action);
          const candidates = leafPieces.filter(
            (piece) => piece.lifecycle_status === requiredStatus,
          );
          const selected = selectedByAction[action];
          return (
            <div key={action} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Icon className="h-4 w-4" />
                  {definition.label}
                </div>
                <span className="text-xs text-slate-500">{candidates.length} ready</span>
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
                    No leaf lots currently have {pieceLifecycleLabel(requiredStatus)} status.
                  </p>
                ) : (
                  candidates.map((piece) => {
                    const reason = logisticsDisabledReason(piece, action);
                    const checked = selected.includes(piece.id);
                    return (
                      <div key={piece.id} className="rounded-md bg-slate-50 p-2">
                        <label className="flex min-w-0 items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            disabled={Boolean(reason)}
                            onChange={() =>
                              setSelectedByAction((current) => ({
                                ...current,
                                [action]: checked
                                  ? current[action].filter((id) => id !== piece.id)
                                  : [...current[action], piece.id],
                              }))
                            }
                          />
                          <span>
                            <button
                              type="button"
                              className="font-semibold text-slate-900 hover:underline"
                              onClick={() => setHistoryPieceId(piece.id)}
                            >
                              {piece.piece_mark} / {piece.lot_code}
                            </button>
                            <span className="block text-slate-500">
                              Qty {Number(piece.quantity).toLocaleString()}
                            </span>
                            {reason && <span className="block text-rose-700">{reason}</span>}
                          </span>
                        </label>
                      </div>
                    );
                  })
                )}
              </div>

              {definition.fields.map(([key, placeholder]) => (
                <Input
                  key={key}
                  value={referenceByAction[action][key] ?? ""}
                  placeholder={placeholder}
                  onChange={(event) =>
                    setReferenceByAction((current) => ({
                      ...current,
                      [action]: { ...current[action], [key]: event.target.value },
                    }))
                  }
                />
              ))}

              <Button
                className="w-full"
                disabled={selected.length === 0 || transitionMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    `${definition.label} (${selected.length})? This physical transition cannot be overridden or reversed.`,
                  );
                  if (confirmed) transitionMutation.mutate({ action });
                }}
              >
                {transitionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {selected.length || ""} {definition.pastLabel.toLowerCase()}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <CheckCircle2 className="h-4 w-4" />
          Piece logistics history
        </div>
        {!historyPiece ? (
          <p className="mt-2 text-sm text-slate-500">
            Select a piece mark above to inspect its immutable logistics history.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="text-sm font-semibold">
              {historyPiece.piece_mark} / {historyPiece.lot_code}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">No logistics events recorded.</p>
            ) : (
              history.map((event) => {
                const referenceData = event.next_state.reference_data ?? {};
                return (
                  <div key={event.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-900">
                        {pieceLifecycleLabel(event.event_type)}
                      </span>
                      <span className="text-slate-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    {Object.keys(referenceData).length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        {Object.entries(referenceData)
                          .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </section>
  );
}
