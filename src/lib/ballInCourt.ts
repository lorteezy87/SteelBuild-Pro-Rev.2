/**
 * ballInCourt — the one list of parties who can hold an RFI or submittal.
 *
 * THIS MUST MATCH THE DB CHECK CONSTRAINTS `chk_rfis_ball_in_court`,
 * `chk_submittals_ball_in_court` and `chk_submittal_rounds_ball_in_court`
 * exactly. Same rule as `drawingEnums.ts`: a
 * value the constraint rejects makes the INSERT fail and the user loses the
 * save, with a raw Postgres constraint name for a message.
 *
 * Why this file exists: before it, the same field had four vocabularies.
 *   - RFIFormModal offered   Contractor, GC, Engineer, Architect, Owner
 *   - RfiBulkEditModal offered Contractor, EOR, Architect, GC, Owner
 *   - approvalChains used    Detailer, GC, Architect, EOR
 *   - submittalReviewEngine / submittalStageMapping treat only
 *     EOR / Architect / AOR as the approver class
 *
 * "Engineer" was the live bug. The RFI form was the only place offering it,
 * nothing ever stored it (0 rows), and because `APPROVER_CLASS_BIC` knows only
 * EOR/Architect/AOR, an RFI parked on "Engineer" was invisible to the
 * approver-class logic. It is a synonym for EOR and is gone.
 *
 * `AOR` has no rows in production but IS in the approver class in code, so it
 * stays in the vocabulary — omitting it would make a code path that already
 * exists start failing at the constraint.
 *
 * "S&H" was the other live bug, and the more dangerous one. Five separate
 * BIC_CHOICES lists offered it, four "detailer class" sets accepted it, and it
 * was never in this vocabulary — so once `chk_submittals_ball_in_court` landed,
 * picking it in SubmittalDetail, the submittal form, the register panel, the
 * hub's inline control, the suggest strip or bulk edit failed the save with a
 * raw Postgres constraint name. Zero rows ever stored it (the constraint
 * validated clean), so removing it lost nothing. It is a private company and
 * has no place in this product's logic; every picker now reads this list.
 */

/** Every party that may hold the ball. Order is the order menus render. */
export const BALL_IN_COURT_PARTIES = [
  "Contractor",
  "Subcontractor",
  "Detailer",
  "GC",
  "EOR",
  "AOR",
  "Architect",
  "Owner",
] as const;

export type BallInCourtParty = (typeof BALL_IN_COURT_PARTIES)[number];

const PARTY_SET: ReadonlySet<string> = new Set(BALL_IN_COURT_PARTIES);

/**
 * NULL means nobody holds it — the record is closed, or it was never routed.
 *
 * Imported rows may also have an unknown party; status determines closure.
 * `ball_in_court` used to carry the
 * literal string "Closed" on 6 production rows, which is a status, not a party;
 * the status column already said Closed on every one of them. Absence is the
 * honest representation and the constraint permits it.
 */
export function isValidBallInCourt(value: unknown): value is BallInCourtParty | null {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && PARTY_SET.has(value);
}

/** Menu options for a select. Includes an explicit "nobody" choice. */
export const BALL_IN_COURT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— Nobody (closed / not routed)" },
  ...BALL_IN_COURT_PARTIES.map((p) => ({ value: p, label: p })),
];

/**
 * Normalize a party for storage. Empty string becomes null: a <select> whose
 * placeholder option is "" would otherwise store "" and fail the constraint,
 * which is the same class of bug as the project-date union that rejected null.
 */
export function normalizeBallInCourt(value: unknown): BallInCourtParty | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "engineer") return "EOR";
  return BALL_IN_COURT_PARTIES.find((party) => party.toLowerCase() === trimmed.toLowerCase()) ?? null;
}
