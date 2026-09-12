import { describe, expect, it } from "vitest";
import { SupabaseOperationError } from "@/api/client/errors";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { normalizeThrownQueryError } from "@/lib/postgrestErrors";
import {
  DOWNGRADE_ELIGIBLE_CODES,
  EXPECTED_ERROR_RULES,
  PIECE_ARCHIVE_EXPECTED_ERRORS,
  PIECE_MODE_EXPECTED_ERRORS,
  classifyReportedError,
  mutationReportingInput,
  queryReportingAction,
  reportingMeta,
  resolveReportedAction,
  type ClassifyContext,
  type UnexpectedReason,
} from "../reportedErrors";

const HELD = "Held or production-started pieces cannot be archived";
const FALLBACK = "The selected pieces could not be archived.";
const PERMISSION_TEXT = "You do not have permission to complete this Piece Register action.";
const UUID_LETTER_FIRST = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const UUID_DIGIT_FIRST = "11111111-1111-4111-8111-111111111111";

/** A PostgREST rejection the way the piece repositories throw it. */
function pg(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return normalizeThrownQueryError({ code, message, ...extra });
}

const OPTED_IN_ARCHIVE: ClassifyContext = {
  source: "mutation",
  rawIsError: true,
  hasLocalHandler: true,
  expectedErrors: PIECE_ARCHIVE_EXPECTED_ERRORS,
};

function withRules(expectedErrors: unknown): ClassifyContext {
  return { ...OPTED_IN_ARCHIVE, expectedErrors };
}

/** A rule someone might add by mistake: wrong code, loose pattern, bad flags. */
function rogue(code: string, message: RegExp) {
  return { id: `rogue.${code}`, code, message, example: "" };
}

describe("classifyReportedError: allowlisted guards (T1)", () => {
  for (const rule of EXPECTED_ERROR_RULES) {
    it(`downgrades ${rule.id} when its mutation opts in`, () => {
      expect(
        classifyReportedError(pg(rule.code, rule.example), {
          source: "mutation",
          rawIsError: true,
          hasLocalHandler: true,
          expectedErrors: [rule],
        }),
      ).toEqual({ verdict: "expected", reason: "matched-rule", ruleId: rule.id, code: "P0001" });
    });
  }

  it("downgrades each guard through its own screen's bundle only", () => {
    for (const rule of PIECE_ARCHIVE_EXPECTED_ERRORS) {
      expect(classifyReportedError(pg("P0001", rule.example), OPTED_IN_ARCHIVE).verdict).toBe(
        "expected",
      );
      expect(
        classifyReportedError(pg("P0001", rule.example), withRules(PIECE_MODE_EXPECTED_ERRORS))
          .reason,
      ).toBe("no-rule-match");
    }
    for (const rule of PIECE_MODE_EXPECTED_ERRORS) {
      expect(
        classifyReportedError(pg("P0001", rule.example), withRules(PIECE_MODE_EXPECTED_ERRORS))
          .verdict,
      ).toBe("expected");
      expect(classifyReportedError(pg("P0001", rule.example), OPTED_IN_ARCHIVE).reason).toBe(
        "no-rule-match",
      );
    }
  });

  it("catalogues exactly the five reviewed guards", () => {
    expect(PIECE_ARCHIVE_EXPECTED_ERRORS.map((rule) => rule.id)).toEqual([
      "piece-archive.held-or-started",
      "piece-archive.split-lot",
      "piece-archive.canonical-release",
    ]);
    expect(PIECE_MODE_EXPECTED_ERRORS.map((rule) => rule.id)).toEqual([
      "piece-mode.pilot-blocked",
      "piece-mode.live-blocked",
    ]);
    expect(EXPECTED_ERROR_RULES).toEqual([
      ...PIECE_ARCHIVE_EXPECTED_ERRORS,
      ...PIECE_MODE_EXPECTED_ERRORS,
    ]);
  });
});

describe("expected-error catalogue invariants (T2)", () => {
  it("keeps the downgrade ceiling at P0001", () => {
    expect([...DOWNGRADE_ELIGIBLE_CODES]).toEqual(["P0001"]);
  });

  for (const rule of EXPECTED_ERROR_RULES) {
    it(`${rule.id} is anchored, inside the ceiling, and matches its RAISE text`, () => {
      expect(rule.message.source.startsWith("^")).toBe(true);
      expect(rule.message.source).not.toContain("|");
      expect(rule.message.flags).not.toMatch(/[gmy]/);
      expect(DOWNGRADE_ELIGIBLE_CODES.has(rule.code)).toBe(true);
      expect(rule.message.test(rule.example)).toBe(true);
    });

    it(`${rule.id} is explained to the user with specific text`, () => {
      for (const error of [new Error(rule.example), pg(rule.code, rule.example)]) {
        const shown = presentPieceControlError(error, FALLBACK);
        expect(shown).not.toBe(FALLBACK);
        expect(shown).not.toBe(PERMISSION_TEXT);
        expect(shown).not.toContain(rule.example);
      }
    });
  }
});

describe("classifyReportedError: everything else stays reported (T3)", () => {
  const cases: ReadonlyArray<{
    name: string;
    error: unknown;
    ctx: ClassifyContext;
    reason: UnexpectedReason;
  }> = [
    { name: "archive text under 42501", error: pg("42501", HELD), ctx: OPTED_IN_ARCHIVE, reason: "code-not-eligible" },
    { name: "archive text on a plain Error with no code", error: new Error(HELD), ctx: OPTED_IN_ARCHIVE, reason: "no-code" },
    {
      name: "a TypeError",
      error: new TypeError("Cannot read properties of undefined (reading 'id')"),
      ctx: OPTED_IN_ARCHIVE,
      reason: "no-code",
    },
    { name: "an unmapped P0001 invariant", error: pg("P0001", "Piece events are immutable"), ctx: OPTED_IN_ARCHIVE, reason: "no-rule-match" },
    { name: "archive text with a trailing clause", error: pg("P0001", `${HELD} for lot 12`), ctx: OPTED_IN_ARCHIVE, reason: "no-rule-match" },
    {
      name: "the stale-selection guard",
      error: pg("P0001", "All selected pieces must be active and belong to the same project"),
      ctx: OPTED_IN_ARCHIVE,
      reason: "no-rule-match",
    },
    {
      name: "an official-number collision, even with a rogue 23505 rule",
      error: pg("23505", 'duplicate key value violates unique constraint "uq_rfis_project_number"'),
      ctx: withRules([rogue("23505", /^duplicate key value/)]),
      reason: "code-not-eligible",
    },
    {
      name: "DRAWING_SET_LOCKED, even with a rogue 42501 rule",
      error: pg("42501", "DRAWING_SET_LOCKED: this drawing set is locked"),
      ctx: withRules([rogue("42501", /^DRAWING_SET_LOCKED:/)]),
      reason: "code-not-eligible",
    },
    {
      name: "PGRST116, even with a rogue rule",
      error: pg("PGRST116", "JSON object requested, multiple (or no) rows returned"),
      ctx: withRules([rogue("PGRST116", /^JSON object requested/)]),
      reason: "code-not-eligible",
    },
    {
      name: "a 57014 timeout, even with a rogue rule",
      error: pg("57014", "canceling statement due to statement timeout"),
      ctx: withRules([rogue("57014", /^canceling statement/)]),
      reason: "code-not-eligible",
    },
    {
      name: "a 22P05 null-character rejection, even with a rogue rule",
      error: pg("22P05", "unsupported Unicode escape sequence"),
      ctx: withRules([rogue("22P05", /^unsupported Unicode/)]),
      reason: "code-not-eligible",
    },
    {
      name: "a 23503 foreign-key violation, even with a rogue rule",
      error: pg("23503", 'insert or update on table "pieces" violates foreign key constraint'),
      ctx: withRules([rogue("23503", /^insert or update/)]),
      reason: "code-not-eligible",
    },
    { name: "a rogue unanchored rule", error: pg("P0001", HELD), ctx: withRules([rogue("P0001", /cannot be archived/)]), reason: "no-rule-match" },
    {
      name: "a rule with a g flag",
      error: pg("P0001", HELD),
      ctx: withRules([rogue("P0001", /^Held or production-started pieces cannot be archived$/g)]),
      reason: "no-rule-match",
    },
    {
      name: "a rule with a y flag",
      error: pg("P0001", HELD),
      ctx: withRules([rogue("P0001", /^Held or production-started pieces cannot be archived$/y)]),
      reason: "no-rule-match",
    },
    {
      name: "a rule with an m flag",
      error: pg("P0001", `Something else\n${HELD}`),
      ctx: withRules([rogue("P0001", /^Held or production-started pieces cannot be archived$/m)]),
      reason: "no-rule-match",
    },
    {
      name: "a rule that escapes its anchor with |",
      error: pg("P0001", HELD),
      ctx: withRules([rogue("P0001", /^Nothing|cannot be archived$/)]),
      reason: "no-rule-match",
    },
    {
      name: "a rule without an id",
      error: pg("P0001", HELD),
      ctx: withRules([{ code: "P0001", message: /^Held or production-started pieces cannot be archived$/ }]),
      reason: "no-rule-match",
    },
    {
      name: "a rule written for another SQLSTATE",
      error: pg("P0001", HELD),
      ctx: withRules([rogue("23505", /^Held or production-started pieces cannot be archived$/)]),
      reason: "no-rule-match",
    },
    {
      name: "a rule with no code",
      error: pg("P0001", HELD),
      ctx: withRules([{ id: "no-code", message: /^Held or production-started pieces cannot be archived$/ }]),
      reason: "no-rule-match",
    },
    { name: "a rule given as a bare id", error: pg("P0001", HELD), ctx: withRules(["piece-archive.held-or-started"]), reason: "no-rule-match" },
    { name: "a mutation with no local onError", error: pg("P0001", HELD), ctx: { ...OPTED_IN_ARCHIVE, hasLocalHandler: false }, reason: "no-local-handler" },
    {
      name: "a mutation that did not opt in",
      error: pg("P0001", HELD),
      ctx: { source: "mutation", rawIsError: true, hasLocalHandler: true },
      reason: "not-opted-in",
    },
    { name: "an empty opt-in list", error: pg("P0001", HELD), ctx: withRules([]), reason: "not-opted-in" },
    { name: "an opt-in that is a single rule, not a list", error: pg("P0001", HELD), ctx: withRules(PIECE_ARCHIVE_EXPECTED_ERRORS[0]), reason: "not-opted-in" },
    { name: "an opt-in that is a string", error: pg("P0001", HELD), ctx: withRules("piece-archive.held-or-started"), reason: "not-opted-in" },
    { name: "a raw rejection that was not an Error", error: pg("P0001", HELD), ctx: { ...OPTED_IN_ARCHIVE, rawIsError: false }, reason: "raw-not-error" },
    { name: "a query, even an opted-in one", error: pg("P0001", HELD), ctx: { ...OPTED_IN_ARCHIVE, source: "query" }, reason: "query-always-reported" },
  ];

  for (const testCase of cases) {
    it(`keeps reporting ${testCase.name} (${testCase.reason})`, () => {
      const verdict = classifyReportedError(testCase.error, testCase.ctx);
      expect(verdict.verdict).toBe("unexpected");
      expect(verdict.reason).toBe(testCase.reason);
    });
  }

  it("carries the SQLSTATE on every verdict, or an empty code", () => {
    expect(classifyReportedError(pg("57014", "canceling statement"), OPTED_IN_ARCHIVE).code).toBe(
      "57014",
    );
    expect(
      classifyReportedError(pg("42501", "permission denied"), { ...OPTED_IN_ARCHIVE, source: "query" })
        .code,
    ).toBe("42501");
    expect(classifyReportedError(new TypeError("x"), OPTED_IN_ARCHIVE).code).toBe("");
  });
});

/**
 * The opted-in RPCs' other P0001 RAISEs are request bugs, drift or stale state,
 * never an outcome the screen explains. A widened rule such as
 * /^[A-Z][A-Za-z ]+: / still passes usableRule's anchoring checks, so only
 * these texts catch it.
 */
describe("classifyReportedError: the opted-in RPCs' other errors stay reported (T17)", () => {
  // set_piece_control_mode (supabase/migrations/20260718070000_piece_control_slice7.sql)
  const modeErrors = [
    "Invalid Piece Control mode",
    "Project not found",
    "Project is already in pilot mode",
    "Unsafe Piece Control transition from off to live",
    "Confirmation must exactly match: CHANGE SHADOW TO PILOT",
  ];
  // archive_piece_lots (supabase/migrations/20260720213000_archive_canonical_pieces.sql).
  // The stale-selection guard is covered in T3.
  const archiveErrors = [
    "Select at least one piece to archive",
    "Confirmation must exactly match ARCHIVE 1 PIECE",
    "An archive reason is required",
    "Project not found",
    "Piece control is disabled for this project",
    // Unreachable on consistent data, so a hit is drift (see PIECE_ARCHIVE_EXPECTED_ERRORS).
    "Pieces with production history cannot be archived",
  ];
  const stillReported = { verdict: "unexpected", reason: "no-rule-match", code: "P0001" };

  for (const message of modeErrors) {
    it(`pieceControl.setMode keeps reporting "${message}"`, () => {
      expect(
        classifyReportedError(pg("P0001", message), withRules(PIECE_MODE_EXPECTED_ERRORS)),
      ).toEqual(stillReported);
    });
  }

  for (const message of archiveErrors) {
    it(`pieceRegister.archive keeps reporting "${message}"`, () => {
      expect(classifyReportedError(pg("P0001", message), OPTED_IN_ARCHIVE)).toEqual(
        stillReported,
      );
    });
  }

  it("pieceControl.setMode keeps reporting the server admin check (42501)", () => {
    expect(
      classifyReportedError(
        pg("42501", "Only a project admin may change Piece Control mode"),
        withRules(PIECE_MODE_EXPECTED_ERRORS),
      ),
    ).toEqual({ verdict: "unexpected", reason: "code-not-eligible", code: "42501" });
  });
});

describe("classifyReportedError: message normalization (T4)", () => {
  it("strips the [table.op] prefix of a SupabaseOperationError", () => {
    const error = new SupabaseOperationError("pieces", "rpc", { code: "P0001", message: HELD });
    expect(error.message).toBe(`[pieces.rpc] ${HELD}`);
    expect(classifyReportedError(error, OPTED_IN_ARCHIVE)).toEqual({
      verdict: "expected",
      reason: "matched-rule",
      ruleId: "piece-archive.held-or-started",
      code: "P0001",
    });
  });

  it("strips the details, hint and code tail the error carries", () => {
    const error = pg("P0001", HELD, {
      details: "Failing row contains (p1)",
      hint: "Deselect held pieces",
    });
    expect(error.message).toBe(
      `${HELD} — Failing row contains (p1) — Deselect held pieces — P0001`,
    );
    expect(classifyReportedError(error, OPTED_IN_ARCHIVE).verdict).toBe("expected");
  });

  it("does not strip a tail part the error does not carry as a string", () => {
    const error = Object.assign(new Error(`${HELD} — Failing row contains (p1) — P0001`), {
      code: "P0001",
      details: null,
    });
    expect(classifyReportedError(error, OPTED_IN_ARCHIVE).reason).toBe("no-rule-match");
  });

  it("never cuts a message that itself contains ' — ' into a $-anchored match", () => {
    const changeOrderRule = {
      id: "change-order.approved-delete",
      code: "P0001",
      message: /^An approved change order cannot be deleted$/,
      example: "An approved change order cannot be deleted",
    };
    const error = pg("P0001", "An approved change order cannot be deleted — void it");
    expect(error.message).toBe("An approved change order cannot be deleted — void it — P0001");
    expect(classifyReportedError(error, withRules([changeOrderRule])).reason).toBe(
      "no-rule-match",
    );
  });
});

describe("resolveReportedAction (T5)", () => {
  const dbError = new SupabaseOperationError("rfis", "update", {
    code: "23505",
    message: 'duplicate key value violates unique constraint "uq_rfis_project_number"',
  });

  it("prefers meta.action", () => {
    expect(
      resolveReportedAction({
        meta: { action: "pieceRegister.archive" },
        mutationKey: ["pieces", "archive"],
        error: dbError,
      }),
    ).toEqual({ action: "pieceRegister.archive", actionSource: "meta" });
  });

  it("then the mutation key", () => {
    expect(
      resolveReportedAction({
        meta: { suppressGlobalErrorToast: true, action: "   " },
        mutationKey: ["pieces", "archive"],
        error: dbError,
      }),
    ).toEqual({ action: "pieces.archive", actionSource: "key" });
  });

  it("then the table and operation of a SupabaseOperationError", () => {
    expect(resolveReportedAction({ error: dbError })).toEqual({
      action: "db:rfis.update",
      actionSource: "db",
    });
  });

  it("else unnamed", () => {
    expect(resolveReportedAction({})).toEqual({ action: "unnamed", actionSource: "none" });
    expect(resolveReportedAction({ error: new Error("save failed") })).toEqual({
      action: "unnamed",
      actionSource: "none",
    });
  });

  it("masks ids, numbers, objects and free text in the key", () => {
    expect(
      resolveReportedAction({
        mutationKey: [
          "pieces",
          UUID_LETTER_FIRST,
          UUID_DIGIT_FIRST,
          42,
          { id: 1 },
          "sam@example.com",
          "hold",
        ],
      }).action,
    ).toBe("pieces.*.*.*.*.*.hold");
  });

  it("falls through a key that is nothing but ids", () => {
    expect(resolveReportedAction({ mutationKey: [UUID_LETTER_FIRST, 7], error: dbError })).toEqual({
      action: "db:rfis.update",
      actionSource: "db",
    });
  });

  it("names queries by meta.action, else by an identifier queryKey[0]", () => {
    expect(queryReportingAction({ queryKey: ["piece-register", "p1"] })).toEqual({
      action: "piece-register",
      actionSource: "key",
    });
    expect(queryReportingAction({ queryKey: [UUID_LETTER_FIRST, "pieces"] })).toEqual({
      action: "unnamed",
      actionSource: "none",
    });
    expect(
      queryReportingAction({ meta: { action: "pieces.list" }, queryKey: ["piece-register"] }),
    ).toEqual({ action: "pieces.list", actionSource: "meta" });
  });

  it("reads a mutation's action, local handler and opt-in", () => {
    const onError = (): void => undefined;
    expect(
      mutationReportingInput({
        meta: reportingMeta("pieceRegister.archive", PIECE_ARCHIVE_EXPECTED_ERRORS),
        options: { onError },
      }),
    ).toEqual({
      action: "pieceRegister.archive",
      actionSource: "meta",
      hasLocalHandler: true,
      expectedErrors: PIECE_ARCHIVE_EXPECTED_ERRORS,
    });
    // suppressGlobalErrorToast silences the toast; it is not a handler.
    expect(
      mutationReportingInput(
        { meta: { suppressGlobalErrorToast: true }, options: { mutationKey: ["drawings", "publish"] } },
        dbError,
      ),
    ).toEqual({
      action: "drawings.publish",
      actionSource: "key",
      hasLocalHandler: false,
      expectedErrors: undefined,
    });
  });

  it("builds meta that only carries expectedErrors when given", () => {
    expect(reportingMeta("pieceRegister.hold")).toEqual({ action: "pieceRegister.hold" });
    expect("expectedErrors" in reportingMeta("pieceRegister.hold")).toBe(false);
    expect(reportingMeta("pieceControl.setMode", PIECE_MODE_EXPECTED_ERRORS)).toEqual({
      action: "pieceControl.setMode",
      expectedErrors: PIECE_MODE_EXPECTED_ERRORS,
    });
  });
});
