/**
 * docControl/changeSummary.ts — what changed between the sheet of record and
 * the incoming revision of the same sheet.
 *
 * Four channels, and they are not equally knowable:
 *
 *   metadata  — revision code, issue date. Fully comparable.
 *   text      — sheet title and the harvested text layer. Comparable when BOTH
 *               sides were harvested.
 *   callouts  — cross-sheet references. Comparable when the sheet of record was
 *               actually extracted; an empty `callouts` array on a row that was
 *               never extracted means "not looked at", not "no callouts".
 *   line-work — NOT comparable. Geometry lives in the PDF's content stream, not
 *               its text layer. A drawing can move a brace, re-detail a moment
 *               connection and change a weld size without altering one
 *               character of text.
 *
 * The line-work bullet therefore always states the limit rather than claiming
 * "no change". A change summary that reports "no changes" on a sheet whose
 * bracing moved is how steel gets fabricated to a superseded geometry — the
 * summary must send a person to overlay the sheets.
 *
 * Pure. No React, no Supabase.
 */

import type { ChangeBullet, ChangeSummary, CalloutRef, MdrEntry } from "./types";

/** The incoming document, already normalised by `readTitleBlock`. */
export type IncomingSheet = {
  sheetNumber: string | null;
  title: string | null;
  revisionNumber: string | null;
  issueDate: string | null;
  /** Harvested page text, or null when nothing was harvested. */
  extractedText: string | null;
  callouts: CalloutRef[];
  /** True when the incoming PDF had no text layer. */
  scanned: boolean;
};

/** Max sample values quoted in a bullet before it switches to a count. */
const SAMPLE_LIMIT = 5;

/**
 * Build the bulleted change summary.
 *
 * `previous` is null when there is nothing of record to compare against (a new
 * sheet). The summary then says so — it does not fabricate an empty diff.
 */
export function buildChangeSummary(
  incoming: IncomingSheet,
  previous: MdrEntry | null,
): ChangeSummary {
  if (!previous) {
    return {
      comparedAgainst: null,
      bullets: [
        {
          channel: "metadata",
          text: "No sheet of record to compare against — this is a first issue, so every line on it is new.",
          comparable: true,
        },
        lineWorkBullet(),
      ],
    };
  }

  const bullets: ChangeBullet[] = [];

  // ── metadata ───────────────────────────────────────────────────────
  const oldRev = norm(previous.revisionNumber);
  const newRev = norm(incoming.revisionNumber);
  if (oldRev && newRev && oldRev !== newRev) {
    bullets.push({
      channel: "metadata",
      text: `Revision advanced ${previous.revisionNumber} → ${incoming.revisionNumber}.`,
      comparable: true,
    });
  } else if (oldRev && newRev && oldRev === newRev) {
    bullets.push({
      channel: "metadata",
      text: `Revision code is unchanged at ${incoming.revisionNumber} — a re-issue at the same revision. Confirm which one the shop should build to.`,
      comparable: true,
    });
  } else {
    bullets.push({
      channel: "metadata",
      text: "Revision codes could not be compared — one side is not stated.",
      comparable: false,
    });
  }

  // ── text: sheet title ──────────────────────────────────────────────
  const oldTitle = String(previous.title ?? "").trim();
  const newTitle = String(incoming.title ?? "").trim();
  if (oldTitle && newTitle && oldTitle.toUpperCase() !== newTitle.toUpperCase()) {
    bullets.push({
      channel: "text",
      text: `Sheet title changed: "${oldTitle}" → "${newTitle}".`,
      comparable: true,
    });
  }

  // ── text: harvested text layer ─────────────────────────────────────
  bullets.push(textLayerBullet(incoming, previous));

  // ── callouts ───────────────────────────────────────────────────────
  bullets.push(calloutBullet(incoming, previous));

  // ── line work ──────────────────────────────────────────────────────
  bullets.push(lineWorkBullet());

  return {
    comparedAgainst: previous.revisionNumber
      ? `${previous.sheetNumber ?? "sheet"} rev ${previous.revisionNumber}`
      : previous.sheetNumber ?? "sheet of record",
    bullets,
  };
}

function textLayerBullet(incoming: IncomingSheet, previous: MdrEntry): ChangeBullet {
  const oldText = previous.extractedText;
  const newText = incoming.extractedText;

  if (incoming.scanned || newText == null || oldText == null) {
    return {
      channel: "text",
      text:
        "Text layer not comparable — " +
        (incoming.scanned
          ? "the incoming sheet is image-only."
          : newText == null
            ? "no text was harvested from the incoming sheet."
            : "the sheet of record has no harvested text.") +
        " Notes, schedules and weld callouts on it may have changed without being reported here.",
      comparable: false,
    };
  }

  const oldLines = lineSet(oldText);
  const newLines = lineSet(newText);
  const added = [...newLines].filter((l) => !oldLines.has(l));
  const removed = [...oldLines].filter((l) => !newLines.has(l));

  if (added.length === 0 && removed.length === 0) {
    return {
      channel: "text",
      text: "Text layer is identical — no notes, dimensions or schedule text changed.",
      comparable: true,
    };
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} line${added.length === 1 ? "" : "s"} added`);
  if (removed.length) parts.push(`${removed.length} line${removed.length === 1 ? "" : "s"} removed`);
  const samples = [
    ...added.slice(0, SAMPLE_LIMIT).map((l) => `+ ${l}`),
    ...removed.slice(0, SAMPLE_LIMIT).map((l) => `− ${l}`),
  ];

  return {
    channel: "text",
    text: `Text changed (${parts.join(", ")}): ${samples.join(" · ")}${
      added.length + removed.length > samples.length ? " …" : ""
    }`,
    comparable: true,
  };
}

function calloutBullet(incoming: IncomingSheet, previous: MdrEntry): ChangeBullet {
  // An empty callouts array on a row that was never text-harvested means the
  // row was not inspected, not that the sheet references nothing.
  const previousInspected = previous.callouts.length > 0 || previous.extractedText != null;
  if (!previousInspected || incoming.scanned) {
    return {
      channel: "callouts",
      text: incoming.scanned
        ? "Cross-sheet callouts not comparable — the incoming sheet is image-only."
        : "Cross-sheet callouts not comparable — the sheet of record was never text-extracted, so its callout list is unknown rather than empty.",
      comparable: false,
    };
  }

  const oldKeys = calloutKeys(previous.callouts);
  const newKeys = calloutKeys(incoming.callouts);
  const added = [...newKeys].filter((k) => !oldKeys.has(k));
  const removed = [...oldKeys].filter((k) => !newKeys.has(k));

  if (added.length === 0 && removed.length === 0) {
    return {
      channel: "callouts",
      text: "Cross-sheet callouts unchanged.",
      comparable: true,
    };
  }

  const parts: string[] = [];
  if (added.length) parts.push(`now references ${added.slice(0, SAMPLE_LIMIT).join(", ")}`);
  if (removed.length) parts.push(`no longer references ${removed.slice(0, SAMPLE_LIMIT).join(", ")}`);
  return {
    channel: "callouts",
    text: `Cross-sheet callouts changed — ${parts.join("; ")}. Check the detail sheets on both sides before releasing.`,
    comparable: true,
  };
}

/**
 * Always-present, always-honest line-work bullet.
 *
 * There is no `comparable: true` branch. Adding one requires actual geometry
 * comparison (content-stream or raster diff), not a text-layer heuristic.
 */
function lineWorkBullet(): ChangeBullet {
  return {
    channel: "line-work",
    text: "Line work (geometry, member sizes drawn, connection details, clouded areas) is NOT machine-compared — the text layer carries no geometry. Overlay the two sheets before releasing to fabrication.",
    comparable: false,
  };
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function lineSet(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

/**
 * Comparison keys for callout targets. Trim + upper-case only — this is a
 * set-difference key for a summary bullet, never a register identity match
 * (that stays exact, in `mdr.ts`).
 */
function calloutKeys(callouts: CalloutRef[]): Set<string> {
  const out = new Set<string>();
  for (const callout of callouts || []) {
    const key = String(callout?.targetSheetNumber ?? "").trim().toUpperCase();
    if (key) out.add(key);
  }
  return out;
}
