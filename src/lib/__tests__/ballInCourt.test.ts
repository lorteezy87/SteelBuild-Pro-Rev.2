import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BALL_IN_COURT_OPTIONS,
  BALL_IN_COURT_PARTIES,
  isValidBallInCourt,
  normalizeBallInCourt,
} from "../ballInCourt";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260920014500_ball_in_court_vocabulary.sql",
);

describe("ball_in_court vocabulary", () => {
  it("holds every party production actually stores", () => {
    // Counts as of 2026-09-20 across rfis + submittals.
    for (const stored of ["Contractor", "EOR", "Detailer", "GC", "Architect", "Subcontractor"]) {
      expect(BALL_IN_COURT_PARTIES).toContain(stored);
    }
  });

  // "Engineer" was offered by RFIFormModal alone, stored by nothing, and not in
  // APPROVER_CLASS_BIC -- so an RFI parked on it was invisible to the
  // approver-class logic. It is a synonym for EOR.
  it("does not offer Engineer, which is a synonym for EOR", () => {
    expect(BALL_IN_COURT_PARTIES).not.toContain("Engineer");
    expect(BALL_IN_COURT_PARTIES).toContain("EOR");
  });

  // Zero rows, but submittalReviewEngine and submittalStageMapping both treat
  // it as an approver -- excluding it would break a path that already exists.
  it("keeps AOR, which code classifies even though no row stores it", () => {
    expect(BALL_IN_COURT_PARTIES).toContain("AOR");
  });

  it("rejects a status masquerading as a party", () => {
    expect(isValidBallInCourt("Closed")).toBe(false);
    expect(isValidBallInCourt("Open")).toBe(false);
  });

  // NULL is legal and load-bearing: nobody holds the ball on a closed record.
  // It is not the same as "open but unassigned".
  it("treats null and undefined as valid — nobody holds it", () => {
    expect(isValidBallInCourt(null)).toBe(true);
    expect(isValidBallInCourt(undefined)).toBe(true);
  });

  // A <select> placeholder stores "", which the CHECK would reject. Same class
  // of bug as the project-date union that rejected null.
  it("normalises an empty select back to null rather than storing ''", () => {
    expect(normalizeBallInCourt("")).toBeNull();
    expect(normalizeBallInCourt("   ")).toBeNull();
    expect(normalizeBallInCourt("Closed")).toBeNull();
    expect(normalizeBallInCourt("EOR")).toBe("EOR");
  });

  it("offers an explicit nobody option ahead of the parties", () => {
    expect(BALL_IN_COURT_OPTIONS[0].value).toBe("");
    expect(BALL_IN_COURT_OPTIONS).toHaveLength(BALL_IN_COURT_PARTIES.length + 1);
  });
});

describe("the migration and the TS list agree", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  // The whole point of the file. If these drift, an INSERT the UI allows will
  // fail at the constraint with a raw Postgres error and the user loses the save.
  it("constrains both tables to exactly the TS vocabulary", () => {
    for (const table of ["rfis", "submittals"]) {
      const match = sql.match(
        new RegExp(`chk_${table}_ball_in_court[\\s\\S]*?array\\[([^\\]]+)\\]`, "i"),
      );
      expect(match, `no array literal found for chk_${table}_ball_in_court`).toBeTruthy();
      const parties = (match?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
      expect(parties.sort()).toEqual([...BALL_IN_COURT_PARTIES].sort());
    }
  });

  it("permits NULL on both constraints", () => {
    expect(sql).toMatch(/rfis[\s\S]*?ball_in_court is null/i);
    expect(sql).toMatch(/submittals[\s\S]*?ball_in_court is null/i);
  });

  // Nulling a row whose status is still open would hide a live ball.
  it("only retires the Closed sentinel on terminal rows", () => {
    expect(sql).toMatch(/update public\.rfis[\s\S]*?status in \('Closed', 'Void'\)/);
    expect(sql).toMatch(/update public\.submittals[\s\S]*?status in \([^)]*'Released for Fabrication'/);
  });

  it("adds the case-folded guard on number_sequences", () => {
    expect(sql).toMatch(/unique index if not exists uq_number_sequences_project_record_ci/i);
    expect(sql).toMatch(/upper\(record_type\)/i);
  });

  // Repo conventions: guarded with to_regclass, ends with the PostgREST reload.
  it("follows the repo migration conventions", () => {
    expect(sql).toMatch(/to_regclass\('public\.rfis'\)/);
    expect(sql).toMatch(/to_regclass\('public\.submittals'\)/);
    expect(sql).toMatch(/raise notice/i);
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});

describe("the RFI modals no longer disagree", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("both take their options from the shared list", () => {
    for (const file of [
      "src/components/rfis/RFIFormModal.jsx",
      "src/components/rfis/RfiBulkEditModal.jsx",
    ]) {
      const src = read(file);
      expect(src).toContain("BALL_IN_COURT_PARTIES");
      expect(src, `${file} still hard-codes a party list`).not.toMatch(
        /\[\s*"Contractor",\s*"(GC|EOR)"/,
      );
    }
  });

  // Checked against code only: the file explains in a comment why "Engineer"
  // was removed, and that prose must not fail the guard it documents.
  it("neither offers Engineer as a choice any more", () => {
    const withoutComments = read("src/components/rfis/RFIFormModal.jsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toContain("Engineer");
  });
});

describe("the retired spellings resolve instead of vanishing", () => {
  // normalizeBallInCourt returns null for anything it cannot place, which is
  // right for a person's name but wrong for a value that HAS a party: "S&H"
  // silently becoming null would drop the ball-in-court off every imported
  // row rather than pointing it at the subcontractor.
  it("maps S&H to Subcontractor — S&H Steel is the GC's subcontractor", () => {
    expect(normalizeBallInCourt("S&H")).toBe("Subcontractor");
  });

  it("maps Engineer to EOR, the party it was always a synonym for", () => {
    expect(normalizeBallInCourt("Engineer")).toBe("EOR");
  });

  it("matches an alias whatever the spreadsheet capitalised it as", () => {
    for (const spelling of ["s&h", "S&H", "  s&H  "]) {
      expect(normalizeBallInCourt(spelling)).toBe("Subcontractor");
    }
    expect(normalizeBallInCourt("ENGINEER")).toBe("EOR");
  });

  it("still refuses a person's name rather than guessing a party", () => {
    // The RFI log importer routed rfis.assigned_to straight into this column.
    expect(normalizeBallInCourt("John Doe, PE")).toBeNull();
    expect(normalizeBallInCourt("Closed")).toBeNull();
  });

  it("never resolves an alias to a value the constraint rejects", () => {
    for (const alias of ["S&H", "Engineer"]) {
      expect(isValidBallInCourt(normalizeBallInCourt(alias))).toBe(true);
    }
  });
});

describe("every ball_in_court WRITER uses the shared vocabulary", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  // The constraint went live before the app matched it, and the first pass
  // fixed only the two RFI modals. These are the rest of the modules that
  // decide what can be put INTO rfis / submittals / submittal_rounds
  // .ball_in_court. A writer that spells its own list is how "S&H" survived:
  // the picker offered it, the database refused it, and the user got a raw
  // Postgres constraint name.
  //
  // The two format modules are each one list behind SEVERAL pickers --
  // submittals/format feeds SubmittalDetail, SubmittalFormModal,
  // SubmittalRegisterPanel and StatusSuggestStrip; drawingSubmittalHub/format
  // feeds the hub's inline control. Counting modals alone undercounts the
  // write surface, which is how this list missed them the first time.
  const WRITERS = [
    "src/components/rfis/RFIFormModal.jsx",
    "src/components/rfis/RfiBulkEditModal.jsx",
    "src/pages/rfis/constants.js",
    "src/components/submittals/NewRoundModal.jsx",
    "src/components/submittals/SubmittalBulkEditModal.jsx",
    "src/components/submittals/SubmittalBulkAddModal.jsx",
    "src/pages/submittals/format.ts",
    "src/pages/drawingSubmittalHub/format.ts",
    "src/lib/importRfiLog.js",
  ];

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("imports from @/lib/ballInCourt rather than re-spelling the list", () => {
    for (const file of WRITERS) {
      expect(stripComments(read(file)), `${file} must use the shared vocabulary`)
        .toMatch(/from "@\/lib\/ballInCourt"/);
    }
  });

  it("offers neither S&H nor Engineer anywhere a value can be written", () => {
    for (const file of WRITERS) {
      const code = stripComments(read(file));
      expect(code, `${file} still offers S&H`).not.toContain('"S&H"');
      expect(code, `${file} still offers Engineer`).not.toContain('"Engineer"');
    }
  });

  it("keeps the RFI detail panel's colour map complete", () => {
    // DetailPanel writes BIC_PARTIES straight to the column on click and
    // tones each chip via BIC_COLORS[p] || BIC_COLORS.Contractor. A party
    // missing from the map renders as a second Contractor chip — wrong, and
    // it looks deliberate.
    const code = read("src/pages/rfis/constants.js");
    for (const party of BALL_IN_COURT_PARTIES) {
      expect(code, `BIC_COLORS has no entry for ${party}`).toMatch(
        new RegExp(`\\b${party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*\\{`),
      );
    }
  });
});

describe("no module re-spells the party vocabulary", () => {
  // The scan above only checks files it already knows about, which is exactly
  // how src/pages/submittals/format.ts and drawingSubmittalHub/format.ts were
  // missed: each is one BIC_CHOICES behind several pickers. This catches a
  // NEW list instead, by looking for the vocabulary's own shape anywhere in
  // src/ rather than in a maintained roster.
  const SRC = join(process.cwd(), "src");
  const CANONICAL = ["src/lib/ballInCourt.ts"];

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx|js|jsx)$/.test(e.name) ? [full] : [];
    });

  it("never names S&H alongside real parties, in any list", () => {
    // NOT a ban on the string. S&H Steel is the founding customer and appears
    // legitimately all over the repo as domain prose, a PDF byline and a
    // settings placeholder. What must not exist is "S&H" sitting in a literal
    // BESIDE canonical parties -- that shape is a party list or a
    // classification set, and there it is a value three CHECK constraints
    // reject. It survived in four detailer-class sets after the pickers were
    // fixed, where it was a dead branch that made the sets look authoritative.
    const offenders = walk(SRC)
      .filter((f) => !/__tests__|\.test\./.test(f))
      .filter((f) => {
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        const literals: string[] = code.match(/\[[^[\]]*\]/gs) ?? [];
        return literals.some(
          (literal) =>
            literal.includes('"S&H"') &&
            BALL_IN_COURT_PARTIES.some((party) => literal.includes(`"${party}"`)),
        );
      })
      .map((f) => f.slice(process.cwd().length + 1));

    expect(offenders, "S&H is not a party these constraints accept").toEqual([]);
  });

  it("declares the full party list in exactly one place", () => {
    // Deliberately NOT "mentions a party". Classification subsets are
    // legitimate and must stay independent: DETAILER_CLASS_BIC in
    // submittalStageMapping, DETAILER_CLASS in submittalReviewEngine and
    // DETAILER_CLASS_PARTIES in approvalChains each name the detailing side
    // only, and forcing them onto the whole vocabulary would change what they
    // classify. What must not recur is a second copy of the WHOLE picker
    // list -- that is what a menu offers, and what the constraint judges.
    const QUORUM = 6;
    const offenders = walk(SRC)
      .filter((f) => !CANONICAL.some((c) => f.endsWith(c.replace("src/", "/"))))
      .filter((f) => !/__tests__|\.test\./.test(f))
      .filter((f) => {
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        for (const literal of code.match(/\[[^[\]]*\]/gs) ?? []) {
          const named = BALL_IN_COURT_PARTIES.filter((party) =>
            literal.includes(`"${party}"`),
          );
          if (named.length >= QUORUM) return true;
        }
        return false;
      })
      .map((f) => f.slice(process.cwd().length + 1));

    expect(offenders, "these re-spell the whole vocabulary instead of importing it")
      .toEqual([]);
  });
});
