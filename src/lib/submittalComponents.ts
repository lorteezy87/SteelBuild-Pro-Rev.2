/**
 * submittalComponents.ts — pure helpers for per-drawing-type submittal tracking.
 *
 * Phase 4 of the submittal-logic integration (flag `submittal_drawing_types`).
 * A submittal carries up to 3 "components", one per drawing type
 * (Shop / Erection / Part), each with its own received + released-for-fabrication
 * dates. Shop can be released while Erection still waits — the release-per-type
 * state lives entirely in the `submittal_components` table and is INDEPENDENT of
 * `submittals.status` and the fab-release gate.
 *
 * Everything here is pure + React-free so it can be unit-tested in node
 * (mirrors src/lib/submittalLineage.ts). The UI (components.tsx) renders these
 * derivations; the data layer (useSubmittalComponents.ts) reads/writes the rows.
 */

/** The three drawing types a submittal can be split into, in canonical order. */
export const DRAWING_TYPES = ["Shop", "Erection", "Part"] as const;
export type DrawingType = (typeof DRAWING_TYPES)[number];

/** Single-letter abbreviation used on the S/E/P chips. */
export const DRAWING_TYPE_ABBR: Record<DrawingType, string> = {
  Shop: "S",
  Erection: "E",
  Part: "P",
};

/**
 * A submittal_components row (the fields the UI + derivations actually read).
 * Kept structural (not the generated Row) so the pure helpers stay node-testable
 * without importing the DB types.
 */
export interface SubmittalComponent {
  id?: string;
  submittal_id?: string | null;
  project_id?: string | null;
  drawing_type: string;
  received_date?: string | null;
  released_date?: string | null;
  is_released?: boolean | null;
  notes?: string | null;
}

/** Per-type lifecycle state, in ascending order of progress. */
export type ComponentState = "not_received" | "received" | "released";

/**
 * Derive a single component's state. Release implies received-and-beyond, so
 * `released` wins even if `received_date` was never stamped (a type can be
 * released straight off a same-day receipt). Otherwise a `received_date`
 * (non-empty) means received; nothing means not-received.
 */
export function componentState(c: Pick<SubmittalComponent, "received_date" | "is_released">): ComponentState {
  if (c.is_released === true) return "released";
  if (c.received_date != null && c.received_date !== "") return "received";
  return "not_received";
}

/** Canonical-order comparator for a list of components (Shop → Erection → Part). */
export function compareByDrawingType(a: SubmittalComponent, b: SubmittalComponent): number {
  const ia = (DRAWING_TYPES as readonly string[]).indexOf(a.drawing_type);
  const ib = (DRAWING_TYPES as readonly string[]).indexOf(b.drawing_type);
  // Unknown types sort after the known three (defensive — CHECK constraint
  // should prevent them, but a stale client shouldn't crash on one).
  const ra = ia === -1 ? DRAWING_TYPES.length : ia;
  const rb = ib === -1 ? DRAWING_TYPES.length : ib;
  return ra - rb;
}

/** A copy of `components` sorted into canonical drawing-type order. */
export function sortComponents<T extends SubmittalComponent>(components: readonly T[]): T[] {
  return components.slice().sort(compareByDrawingType);
}

export interface ComponentRollup {
  /** How many component rows the submittal has (0 = no per-type tracking yet). */
  total: number;
  /** How many have a received_date. */
  receivedCount: number;
  /** How many are released for fabrication. */
  releasedCount: number;
  /** True when at least one component exists AND every one is released. */
  fullyReleased: boolean;
  /** True when at least one component exists AND at least one (but not all) is released. */
  partiallyReleased: boolean;
  /** True when at least one component is released. */
  anyReleased: boolean;
}

/**
 * Summarize a submittal's components for chips / badges / hub rollups. Pure and
 * empty-safe: an empty (or non-array) input yields an all-zero rollup with every
 * boolean false — so a submittal without per-type tracking reads as "nothing
 * released" rather than "fully released" (an empty `.every()` is vacuously true,
 * which would be the wrong answer here; `fullyReleased` guards on total > 0).
 */
export function rollupComponents(components: readonly SubmittalComponent[] | null | undefined): ComponentRollup {
  const list = Array.isArray(components) ? components : [];
  const total = list.length;
  let receivedCount = 0;
  let releasedCount = 0;
  for (const c of list) {
    const state = componentState(c);
    if (state === "received" || state === "released") receivedCount += 1;
    if (state === "released") releasedCount += 1;
  }
  return {
    total,
    receivedCount,
    releasedCount,
    fullyReleased: total > 0 && releasedCount === total,
    partiallyReleased: total > 0 && releasedCount > 0 && releasedCount < total,
    anyReleased: releasedCount > 0,
  };
}

export interface ChipDescriptor {
  drawingType: DrawingType;
  abbr: string;
  state: ComponentState;
  /** Human label for the tooltip, e.g. "Shop: released". */
  title: string;
}

const STATE_LABEL: Record<ComponentState, string> = {
  not_received: "not received",
  received: "received",
  released: "released",
};

/**
 * Build the ordered S/E/P chip descriptors for a submittal's components.
 * Returns one descriptor per EXISTING component (a submittal that only tracks
 * Shop shows just an "S" chip), in canonical order. Empty input ⇒ [].
 */
export function buildComponentChips(
  components: readonly SubmittalComponent[] | null | undefined,
): ChipDescriptor[] {
  const list = Array.isArray(components) ? components : [];
  return sortComponents(list)
    .filter((c): c is SubmittalComponent & { drawing_type: DrawingType } =>
      (DRAWING_TYPES as readonly string[]).includes(c.drawing_type),
    )
    .map((c) => {
      const state = componentState(c);
      return {
        drawingType: c.drawing_type,
        abbr: DRAWING_TYPE_ABBR[c.drawing_type],
        state,
        title: `${c.drawing_type}: ${STATE_LABEL[state]}`,
      };
    });
}

/** The drawing types NOT yet present on a submittal (available to add). */
export function missingDrawingTypes(
  components: readonly SubmittalComponent[] | null | undefined,
): DrawingType[] {
  const present = new Set(
    (Array.isArray(components) ? components : []).map((c) => c.drawing_type),
  );
  return DRAWING_TYPES.filter((t) => !present.has(t));
}

/**
 * Compute the patch to toggle a component's release state. Releasing stamps
 * `released_date` with `today`; un-releasing clears it. Deterministic — the
 * caller passes today (never new Date() in a pure helper); mirrors the
 * tracker's useReleaseComponent patch shape.
 */
export function releasePatch(
  released: boolean,
  today: string,
): { is_released: boolean; released_date: string | null } {
  return released
    ? { is_released: true, released_date: today }
    : { is_released: false, released_date: null };
}
