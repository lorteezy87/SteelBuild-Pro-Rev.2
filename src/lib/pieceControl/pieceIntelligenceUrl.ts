import type { PieceRegisterViewId } from "@/pages/pieceRegister/registerHelpers";

export type PieceRegisterIntelligenceView = PieceRegisterViewId;

export type PieceRegisterFocus = "held" | "revision" | "release" | "field";

export interface PieceRegisterUrlState {
  view: PieceRegisterViewId;
  focus: PieceRegisterFocus | null;
  pieceId: string | null;
  revisionId: string | null;
}

const PIECE_REGISTER_FOCUSES = [
  "held",
  "revision",
  "release",
  "field",
] as const;

function getNonEmptyParam(params: URLSearchParams, key: string): string | null {
  return params.get(key) || null;
}

function isPieceRegisterView(value: string | null): value is PieceRegisterViewId {
  return [
    "overview",
    "impact",
    "register",
    "board",
    "import",
    "relationships",
    "production",
    "logistics",
    "settings",
  ].includes(value || "");
}

function isPieceRegisterFocus(value: string | null): value is PieceRegisterFocus {
  return (PIECE_REGISTER_FOCUSES as readonly string[]).includes(value || "");
}

export function parsePieceRegisterUrl(search: string): PieceRegisterUrlState {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const focus = params.get("focus");

  return {
    view: isPieceRegisterView(view) ? view : "overview",
    focus: isPieceRegisterFocus(focus) ? focus : null,
    pieceId: getNonEmptyParam(params, "piece"),
    revisionId: getNonEmptyParam(params, "revision"),
  };
}

export function updatePieceRegisterUrl(
  search: string,
  patch: Partial<PieceRegisterUrlState>,
): string {
  const params = new URLSearchParams(search);
  const keys: Array<[keyof PieceRegisterUrlState, string]> = [
    ["view", "view"],
    ["focus", "focus"],
    ["pieceId", "piece"],
    ["revisionId", "revision"],
  ];

  for (const [stateKey, parameterKey] of keys) {
    if (!(stateKey in patch)) continue;
    const value = patch[stateKey];
    if (value) {
      params.set(parameterKey, value);
    } else {
      params.delete(parameterKey);
    }
  }

  return params.toString();
}
