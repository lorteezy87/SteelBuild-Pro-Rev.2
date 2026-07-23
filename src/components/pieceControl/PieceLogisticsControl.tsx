import { useMemo, useState, type ChangeEvent } from "react";
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
import { DecisionPanel } from "@/components/command";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";

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
    heading: "Ship",
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
    heading: "Deliver",
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
    heading: "Erect",
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
  const pieces = useMemo(
    () => snapshotQuery.data?.pieces ?? [],
    [snapshotQuery.data?.pieces],
  );
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
      toast.success(`${actionDefinitions[variables.action].pastLabel} selected piece lots.`);
      setSelectedByAction((current) => ({ ...current, [variables.action]: [] }));
      setReferenceByAction((current) => ({ ...current, [variables.action]: {} }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["piece-logistics", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-production", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["canonical-reporting", projectId] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The logistics update could not be recorded.",
        ),
      ),
  });

  if (!enabled) {
    return (
      <section className="piece-operation-state">
        <h2 className="piece-operation-state__title">
          <MapPin size={16} />
          Logistics
        </h2>
        <p>
          Shipment, delivery, and erection actions are unavailable until the Piece Register is set up.
        </p>
      </section>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <section className="piece-operation-state is-loading" aria-label="Loading logistics">
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
            "Logistics data could not be loaded.",
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

  const historyPiece = pieces.find((piece) => piece.id === historyPieceId);
  const history = events.filter((event) => event.piece_id === historyPieceId);

  return (
    <section className="piece-operations">
      <header className="piece-operations__head">
        <div className="piece-operations__intro">
          <span className="piece-operations__icon" aria-hidden="true">
            <MapPin size={17} />
          </span>
          <div>
            <h2>Logistics</h2>
            <p>Record shipment, delivery, and erection as controlled physical events.</p>
            <p className="piece-operations__safety">
              Each batch is atomic. Physical transitions cannot be overridden or reversed.
            </p>
          </div>
        </div>
      </header>

      <div className="piece-logistics-grid">
        {(Object.keys(actionDefinitions) as LogisticsAction[]).map((action) => {
          const definition = actionDefinitions[action];
          const Icon = definition.icon;
          const requiredStatus = requiredLifecycleForAction(action);
          const candidates = leafPieces.filter(
            (piece) => piece.lifecycle_status === requiredStatus,
          );
          const selected = selectedByAction[action];
          return (
            <section key={action} className="piece-operation-card piece-logistics-panel">
              <header className="piece-operation-card__head piece-logistics-panel__head">
                <div>
                  <span className="piece-operation-card__eyebrow">
                    Requires {pieceLifecycleLabel(requiredStatus)}
                  </span>
                  <h3 className="piece-operation-card__title-with-icon">
                    <Icon size={16} />
                    {definition.heading}
                  </h3>
                </div>
                <span className="piece-logistics-panel__count">
                  <strong>{candidates.length}</strong>
                  ready
                </span>
              </header>

              <div className="piece-logistics-candidates">
                {candidates.length === 0 ? (
                  <p className="piece-operation-empty is-compact">
                    No piece lots currently have {pieceLifecycleLabel(requiredStatus)} status.
                  </p>
                ) : (
                  candidates.map((piece) => {
                    const reason = logisticsDisabledReason(piece, action);
                    const checked = selected.includes(piece.id);
                    return (
                      <div key={piece.id} className="piece-logistics-candidate">
                        <input
                          type="checkbox"
                          aria-label={`Select ${piece.piece_mark} / ${piece.lot_code} to ${action}`}
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
                        <div>
                          <button
                            type="button"
                            className="piece-logistics-candidate__mark"
                            onClick={() => setHistoryPieceId(piece.id)}
                          >
                            {piece.piece_mark} / {piece.lot_code}
                          </button>
                          <span>Qty {Number(piece.quantity).toLocaleString()}</span>
                          {reason ? (
                            <span className="piece-logistics-candidate__reason">
                              {reason}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="piece-logistics-references">
                {definition.fields.map(([key, placeholder]) => (
                  <Input
                    key={key}
                    className="piece-command-control"
                    value={referenceByAction[action][key] ?? ""}
                    placeholder={placeholder}
                    aria-label={`${definition.heading}: ${placeholder}`}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setReferenceByAction((current) => ({
                        ...current,
                        [action]: { ...current[action], [key]: event.target.value },
                      }))
                    }
                  />
                ))}
              </div>

              <Button
                className="cmd-btn cmd-btn--primary piece-logistics-panel__submit"
                disabled={selected.length === 0 || transitionMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    `${definition.label} (${selected.length})? This physical transition cannot be overridden or reversed.`,
                  );
                  if (confirmed) transitionMutation.mutate({ action });
                }}
              >
                {transitionMutation.isPending ? (
                  <Loader2 size={16} className="piece-operation-spinner" />
                ) : null}
                Confirm {selected.length || ""} {definition.pastLabel.toLowerCase()}
              </Button>
            </section>
          );
        })}
      </div>

      <DecisionPanel title="Immutable logistics history">
        {!historyPiece ? (
          <p className="piece-operation-empty">
            Select a piece mark above to inspect recorded logistics events.
          </p>
        ) : (
          <div className="piece-operation-history">
            <div className="piece-operation-history__intro">
              <div>
                <strong>
                  {historyPiece.piece_mark} / {historyPiece.lot_code}
                </strong>
                <span>{history.length} logistics events</span>
              </div>
              <p>
                <CheckCircle2 size={15} />
                Recorded physical events are read-only.
              </p>
            </div>
            {history.length === 0 ? (
              <p className="piece-operation-empty is-compact">
                No logistics events recorded.
              </p>
            ) : (
              <div className="piece-operation-history__list">
                {history.map((event) => {
                  const referenceData = event.next_state.reference_data ?? {};
                  return (
                    <div key={event.id} className="piece-operation-history__row">
                      <span className="piece-operation-history__status">
                        <CheckCircle2 size={14} />
                      </span>
                      <span>
                        <strong>{pieceLifecycleLabel(event.event_type)}</strong>
                        {Object.keys(referenceData).length > 0 ? (
                          <small>
                            {Object.entries(referenceData)
                              .map(
                                ([key, value]) =>
                                  `${key.replaceAll("_", " ")}: ${String(value)}`,
                              )
                              .join(" · ")}
                          </small>
                        ) : null}
                      </span>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString()}
                      </time>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DecisionPanel>
    </section>
  );
}
