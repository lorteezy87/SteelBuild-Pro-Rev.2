import {
  resolvePieceRegisterView,
  type PieceRegisterViewId,
} from "./registerHelpers";

export type PieceRegisterIntelligenceView = PieceRegisterViewId;

export const PIECE_INTELLIGENCE_FOCUS = [
  "held",
  "revision",
  "release",
  "field",
] as const;

export type PieceRegisterFocus = (typeof PIECE_INTELLIGENCE_FOCUS)[number];

export interface PieceRegisterUrlState {
  view: PieceRegisterIntelligenceView;
  focus: PieceRegisterFocus | null;
  pieceId: string | null;
  revisionId: string | null;
}

export type PieceRegisterLocation = PieceRegisterUrlState;

export type PieceRegisterLocationPatch = {
  [Key in keyof PieceRegisterUrlState]?: PieceRegisterUrlState[Key] | "" | null;
};

const PARAMETER_KEYS: Array<[keyof PieceRegisterUrlState, string]> = [
  ["view", "view"],
  ["focus", "focus"],
  ["pieceId", "piece"],
  ["revisionId", "revision"],
];

function cleanId(value: string | null): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function isFocus(value: string | null): value is PieceRegisterFocus {
  return (PIECE_INTELLIGENCE_FOCUS as readonly string[]).includes(value ?? "");
}

export function parsePieceRegisterLocation(
  params: URLSearchParams,
): PieceRegisterLocation {
  const focus = params.get("focus");

  return {
    view: resolvePieceRegisterView(params.get("view")),
    focus: isFocus(focus) ? focus : null,
    pieceId: cleanId(params.get("piece")),
    revisionId: cleanId(params.get("revision")),
  };
}

export function writePieceRegisterLocation(
  current: URLSearchParams,
  patch: PieceRegisterLocationPatch,
): URLSearchParams {
  const next = new URLSearchParams(current);

  for (const [stateKey, parameterKey] of PARAMETER_KEYS) {
    if (!(stateKey in patch)) continue;
    const value = patch[stateKey];
    const cleaned = typeof value === "string" ? value.trim() : "";
    if (cleaned) next.set(parameterKey, cleaned);
    else next.delete(parameterKey);
  }

  return next;
}

export function parsePieceRegisterUrl(search: string): PieceRegisterUrlState {
  return parsePieceRegisterLocation(new URLSearchParams(search));
}

export function updatePieceRegisterUrl(
  search: string,
  patch: PieceRegisterLocationPatch,
): string {
  return writePieceRegisterLocation(new URLSearchParams(search), patch).toString();
}
