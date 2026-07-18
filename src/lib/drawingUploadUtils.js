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
 * Match old vs new sheets by sheet number into a diff: each entry is
 * { sheetNumber, oldSheet, newSheet, change } where change is "revised"
 * (in both), "added" (new only), or "removed" (old only). Sorted by number.
 */
export function matchSheets(oldSheets, newSheets) {
  const oldMap = new Map((oldSheets || []).map(s => [s.sheetNumber, s]));
  const newMap = new Map((newSheets || []).map(s => [s.sheetNumber, s]));
  const results = [];
  for (const [num, newSheet] of newMap) {
    const old = oldMap.get(num);
    results.push({ sheetNumber: num, oldSheet: old || null, newSheet, change: old ? "revised" : "added" });
  }
  for (const [num, oldSheet] of oldMap) {
    if (!newMap.has(num)) {
      results.push({ sheetNumber: num, oldSheet, newSheet: null, change: "removed" });
    }
  }
  return results.sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));
}
