// ── drawingUploadUtils — shared helpers for the drawing-upload modals ────
//
// Pure utilities used by DrawingSetUploadModal and RevisionUploadModal: PDF
// detection, revision-number normalization, the next-revision suggestion ladder,
// and the old↔new sheet matcher that powers the revision diff. Extracted so the
// two modals share one code path (isPdfFile / normalizeRevisionNumber were
// byte-for-byte duplicated) and so the revision logic is unit-testable.
//
// Note: formatBytes is intentionally NOT here — the two modals format byte sizes
// differently (the set modal shows a sub-KB "B" tier; the revision modal rounds
// KB to whole numbers), so each keeps its own.

/** True if a File looks like a PDF (by MIME or .pdf extension). */
export function isPdfFile(file) {
  if (!file) return false;
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return mime === "application/pdf" || mime.includes("pdf") || name.endsWith(".pdf");
}

/** Trim a revision value to a non-empty string, or the fallback ("0"). */
export function normalizeRevisionNumber(value, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

/** Validate the revision convention without changing legacy labels. */
export function validateRevisionLabel(value, currentStage) {
  const label = String(value || "").trim().toUpperCase();
  if (!label) return { ok: false, reason: "A revision label is required." };
  const postIfc = ["IFC", "RELEASED"].includes(String(currentStage || "").trim().toUpperCase());
  const numeric = /(?:^|\s)(?:REV\s*)?\d+(?:\s|$)/.test(label) || /^\d+$/.test(label);
  const letter = /^(?:REV\s*)?[A-Z]$/.test(label);
  if (postIfc && !numeric) return { ok: false, reason: "Post-IFC revisions must use a numeric revision." };
  if (!postIfc && !letter && !numeric && !/^(?:IFC|OFA|IFA|IFB|BID SET|ADDENDUM\s+\d+|FINAL IFC)$/.test(label)) {
    return { ok: false, reason: "Use a letter revision before IFC or a numeric revision after IFC." };
  }
  return { ok: true };
}

/**
 * Race a promise against a timeout, rejecting with a retry-friendly message.
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} [label]
 */
export function withTimeout(promise, ms, label = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — please retry`)), ms)
    ),
  ]);
}

/**
 * Random upload batch id (one per wizard session). Each file in the batch
 * carries this id so the UI can later group/aggregate. Prefers crypto.randomUUID.
 */
export function newUploadBatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Suggest likely next-revision labels from the current revision string. */
export function getRevisionSuggestions(currentRev) {
  const rev = (currentRev || "").trim().toUpperCase();
  if (rev === "OFA" || rev === "FOR APPROVAL") return ["IFA", "IFB", "IFC"];
  if (rev === "IFA") return ["IFB", "IFC"];
  if (rev === "IFB") return ["IFC", "BID ADDENDUM 1"];
  if (rev === "IFC") return ["IFC Rev 1", "IFC Rev 2", "ADDENDUM 1"];
  if (rev.startsWith("IFC REV")) {
    const num = parseInt(rev.replace("IFC REV", "").trim()) || 1;
    return [`IFC Rev ${num + 1}`, `IFC Rev ${num + 1} — Addendum`, "FINAL IFC"];
  }
  if (rev === "BID SET") return ["IFC", "ADDENDUM 1", "ADDENDUM 2"];
  // Numeric revisions: "1" → "2", "3" → "4"
  if (/^\d+$/.test(rev)) {
    const next = parseInt(rev) + 1;
    return [String(next), `Rev ${next}`, `IFC Rev ${next}`];
  }
  // Letter revisions: "A" → "B", "C" → "D"
  if (/^[A-Z]$/.test(rev)) {
    const next = String.fromCharCode(rev.charCodeAt(0) + 1);
    return [next, `Rev ${next}`, `IFC Rev ${next}`];
  }
  // "Rev X" numeric pattern: "Rev 1" → "Rev 2"
  if (/^REV\s+(\d+)$/i.test(rev)) {
    const num = parseInt(rev.match(/\d+/)[0]) + 1;
    return [`Rev ${num}`, `Rev ${num} — Final`, `IFC Rev ${num}`];
  }
  // "Rev X" letter pattern: "Rev A" → "Rev B"
  if (/^REV\s+([A-Z])$/i.test(rev)) {
    const letter = rev.match(/[A-Z]$/i)[0].toUpperCase();
    const next = String.fromCharCode(letter.charCodeAt(0) + 1);
    return [`Rev ${next}`, `IFC`, `Final`];
  }
  return ["Rev 1", "Rev 2", "IFC", "Final"];
}

/**
 * Exact sheet-number key. Empty / whitespace-only numbers are treated as missing
 * (ambiguous) so the matcher never invents a pairing from incomplete labels.
 */
export function exactSheetNumber(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Group sheets by exact sheet number. Duplicate keys are retained as arrays so
 * the matcher can refuse to auto-pair ambiguous collisions.
 */
function groupByExactSheetNumber(sheets) {
  const map = new Map();
  for (const sheet of sheets || []) {
    const key = exactSheetNumber(sheet?.sheetNumber ?? sheet?.sheet_number);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(sheet);
  }
  return map;
}

/**
 * Match old vs new sheets by EXACT sheet number into a diff.
 *
 * Each entry is `{ sheetNumber, oldSheet, newSheet, change, ambiguousReason? }`
 * where change is:
 *   - "revised"  — exactly one old + one new with the same exact number
 *   - "added"    — exactly one new with no old counterpart
 *   - "removed"  — exactly one old with no new counterpart
 *   - "ambiguous"— duplicate / empty / conflicting numbers that must be reviewed
 *                 explicitly (never auto-guessed)
 *
 * Sorted by sheet number. Empty sheet numbers never auto-match.
 */
export function matchSheets(oldSheets, newSheets) {
  const oldGroups = groupByExactSheetNumber(oldSheets);
  const newGroups = groupByExactSheetNumber(newSheets);
  const keys = new Set([...oldGroups.keys(), ...newGroups.keys()]);
  const results = [];

  for (const num of keys) {
    const oldList = oldGroups.get(num) || [];
    const newList = newGroups.get(num) || [];

    if (!num) {
      for (const oldSheet of oldList) {
        results.push({
          sheetNumber: "",
          oldSheet,
          newSheet: null,
          change: "ambiguous",
          ambiguousReason: "Sheet number is missing or blank — review before applying.",
        });
      }
      for (const newSheet of newList) {
        results.push({
          sheetNumber: "",
          oldSheet: null,
          newSheet,
          change: "ambiguous",
          ambiguousReason: "Sheet number is missing or blank — review before applying.",
        });
      }
      continue;
    }

    if (oldList.length > 1 || newList.length > 1) {
      results.push({
        sheetNumber: num,
        oldSheet: oldList[0] || null,
        newSheet: newList[0] || null,
        oldSheets: oldList,
        newSheets: newList,
        change: "ambiguous",
        ambiguousReason:
          oldList.length > 1 && newList.length > 1
            ? `Multiple existing and incoming sheets share exact number "${num}".`
            : oldList.length > 1
              ? `Multiple existing sheets share exact number "${num}".`
              : `Multiple incoming sheets share exact number "${num}".`,
      });
      continue;
    }

    const oldSheet = oldList[0] || null;
    const newSheet = newList[0] || null;
    if (oldSheet && newSheet) {
      results.push({ sheetNumber: num, oldSheet, newSheet, change: "revised" });
    } else if (newSheet) {
      results.push({ sheetNumber: num, oldSheet: null, newSheet, change: "added" });
    } else {
      results.push({ sheetNumber: num, oldSheet, newSheet: null, change: "removed" });
    }
  }

  return results.sort((a, b) => String(a.sheetNumber).localeCompare(String(b.sheetNumber)));
}

/** True when the match list contains any ambiguous entries that must be reviewed. */
export function hasAmbiguousSheetMatches(matches) {
  return (matches || []).some((m) => m?.change === "ambiguous");
}

/**
 * Find a single live drawing by exact sheet number. Returns null when zero or
 * multiple live (non-superseded) rows share the number — never guesses.
 */
export function findExactLiveDrawing(drawings, sheetNumber) {
  const key = exactSheetNumber(sheetNumber);
  if (!key) return null;
  const hits = (drawings || []).filter(
    (d) => !d?.is_superseded && exactSheetNumber(d?.sheet_number) === key,
  );
  return hits.length === 1 ? hits[0] : null;
}
