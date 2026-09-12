import {
  logisticsDisabledReason,
  requiredLifecycleForAction,
  type LogisticsAction,
} from "@/lib/pieceControl/lifecycle";
import type {
  LogisticsSnapshot,
  PieceLogisticsEvent,
} from "@/lib/pieceControl/logisticsRepository";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";

export interface LogisticsActionView {
  action: LogisticsAction;
  requiredStatus: string;
  candidates: PieceRegisterRow[];
  selectableIds: string[];
}

export interface PieceLogisticsView {
  pieces: PieceRegisterRow[];
  leafPieces: PieceRegisterRow[];
  actions: Record<LogisticsAction, LogisticsActionView>;
  readyCounts: Record<LogisticsAction, number>;
  historyPiece: PieceRegisterRow | undefined;
  history: PieceLogisticsEvent[];
}

const ACTIONS: LogisticsAction[] = ["ship", "deliver", "erect"];

export function derivePieceLogisticsView(
  snapshot: LogisticsSnapshot | undefined,
  historyPieceId: string | null,
): PieceLogisticsView {
  const pieces = snapshot?.pieces ?? [];
  const events = snapshot?.events ?? [];
  const leafPieces = pieces.filter((piece) => !piece.is_container);
  const actions = Object.fromEntries(
    ACTIONS.map((action) => {
      const requiredStatus = requiredLifecycleForAction(action);
      const candidates = leafPieces.filter(
        (piece) => piece.lifecycle_status === requiredStatus,
      );
      return [
        action,
        {
          action,
          requiredStatus,
          candidates,
          selectableIds: candidates
            .filter((piece) => !logisticsDisabledReason(piece, action))
            .map((piece) => piece.id),
        },
      ];
    }),
  ) as Record<LogisticsAction, LogisticsActionView>;

  return {
    pieces,
    leafPieces,
    actions,
    readyCounts: {
      ship: actions.ship.candidates.length,
      deliver: actions.deliver.candidates.length,
      erect: actions.erect.candidates.length,
    },
    historyPiece: pieces.find((piece) => piece.id === historyPieceId),
    history: events.filter((event) => event.piece_id === historyPieceId),
  };
}
