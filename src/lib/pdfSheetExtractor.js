/**
 * pdfSheetExtractor.js
 *
 * Single source of truth for parsing a structural drawing PDF into a
 * `{ setMeta, sheets[] }` bundle. Both DrawingSetUploadModal and
 * RevisionUploadModal call through this module, so any extraction
 * improvement lands in one place.
 *
 * Pipeline:
 *   1. Read the File bytes.
 *   2. Use pdfjs-dist to extract text from every page, preserving columnar
 *      structure — items on the same y-baseline are sorted by x and joined
 *      with TAB separators when there is a big horizontal gap. That turns a
 *      drawing-index row into "A201\tFIRST FLOOR PLAN\tSTRUCTURAL\t11/04/25\t2"
 *      instead of the ambiguous space-joined blob we used to feed the model.
 *   3. Send the text to Claude via llm-proxy using Anthropic's TOOL USE
 *      feature. A forced tool call guarantees a valid structured response
 *      (no JSON parsing, no regex salvage).
 *   4. Run a deterministic post-processing pass that splits sheet numbers
 *      embedded in titles and normalizes common title-block oddities.
 *
 * Why this matters: previously pdfjs extraction dropped column boundaries,
 * the prompt trusted the model to return clean JSON, and `max_tokens: 4000`
 * truncated large sets. Trust-eroding bugs across the board — every one of
 * them is addressed here.
 */

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { base44 } from "@/api/base44Client";

// Set the worker once, idempotently — safe for multiple imports.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── Tunables ────────────────────────────────────────────────────────
const MAX_CHARS_PER_PAGE   = 2400;
const MAX_TOTAL_TEXT_CHARS = 160_000;
// Rate-limit retry: the Anthropic API has a 10K input tokens/min limit.
// When we hit 429, back off and retry up to MAX_LLM_RETRIES times.
const MAX_LLM_RETRIES      = 4;
const LLM_RETRY_BASE_MS    = 15_000;  // 15s base — rate limit is per minute
// Horizontal gap above which items on the same y-line are considered to
// be in separate columns. PDF units are 1/72in; 14 ≈ 0.2in which
// reliably separates columns in drawing-index tables but keeps words of
// the same phrase together.
const COLUMN_GAP_UNITS = 14;
// Y-tolerance for grouping items onto the same visual line (in PDF units).
const LINE_Y_TOLERANCE = 2.0;

export const EMPTY_SET_META = Object.freeze({
  setName:     "",
  revision:    "",
  issueDate:   "",
  issuedBy:    "",
  discipline:  "",
  projectName: "",
});

// ─── File helpers ────────────────────────────────────────────────────
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract plain-text from every page, preserving columnar structure.
 *
 * Strategy:
 *   1. For each page, collect text items as `{ x, y, str, width }`.
 *   2. Bucket items into lines using a y-tolerance — items whose y-values
 *      are within ±2 PDF units belong to the same visual line.
 *   3. Sort each line's items by x (left to right).
 *   4. Join items with "\t" when the gap between the end of the previous
 *      item and the start of the next is > COLUMN_GAP_UNITS; otherwise
 *      join with a single space (words of the same phrase stay together).
 *   5. Sort lines top-to-bottom and cap each page to MAX_CHARS_PER_PAGE.
 *
 * Tab separators survive the trip to Claude and give the model unambiguous
 * column boundaries, which is the single biggest lever we have against the
 * "sheet number ended up in the title" class of bugs.
 */
async function extractPdfText(file) {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pageCount = pdf.numPages;
  const pages = [];
  let totalChars = 0;

  for (let p = 1; p <= pageCount; p++) {
    if (totalChars >= MAX_TOTAL_TEXT_CHARS) break;

    try {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();

      // 1. Collect raw items with their positions.
      const rawItems = [];
      for (const item of content.items) {
        if (!item?.str) continue;
        const str = String(item.str);
        if (!str.trim()) continue;
        const x = item.transform?.[4] ?? 0;
        const y = item.transform?.[5] ?? 0;
        const width = Number.isFinite(item.width) ? item.width : str.length * 5;
        rawItems.push({ x, y, str, width });
      }

      // 2. Bucket by y-tolerance. We sort once by descending y so stable
      //    buckets form top-to-bottom.
      rawItems.sort((a, b) => b.y - a.y);
      const lines = [];
      for (const it of rawItems) {
        const line = lines.find((l) => Math.abs(l.y - it.y) <= LINE_Y_TOLERANCE);
        if (line) {
          line.items.push(it);
        } else {
          lines.push({ y: it.y, items: [it] });
        }
      }

      // 3. Sort each line's items left-to-right and join with tab/space.
      //    Keep track of x-ends so we can detect columnar gaps.
      const lineStrings = lines.map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        let out = "";
        let prevEnd = -Infinity;
        for (const it of line.items) {
          if (out === "") {
            out = it.str.trim();
          } else {
            const gap = it.x - prevEnd;
            out += (gap > COLUMN_GAP_UNITS ? "\t" : " ") + it.str.trim();
          }
          prevEnd = it.x + it.width;
        }
        return out.replace(/[ \t]+$/g, "");
      }).filter(Boolean);

      let pageText = lineStrings.join("\n");
      if (pageText.length > MAX_CHARS_PER_PAGE) {
        pageText = pageText.slice(0, MAX_CHARS_PER_PAGE) + " …[truncated]";
      }
      pages.push(pageText);
      totalChars += pageText.length;

      // Be kind to the main thread on big sets.
      if (p % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    } catch (pageErr) {
      // A single bad page shouldn't kill the batch.
      console.warn(`[pdfSheetExtractor] page ${p} failed:`, pageErr);
      pages.push("");
    }
  }

  try { await pdf.destroy(); } catch { /* ignore */ }

  return {
    pages,
    totalChars,
    pageCount,
    scanned: totalChars < 50,
  };
}

function buildPdfTextBlock(pages) {
  return pages
    .map((txt, i) => `===== PAGE ${i + 1} =====\n${txt.trim() || "[empty / image-only page]"}`)
    .join("\n\n");
}

// ─── Tool-use schema (forces structured output from Claude) ─────────
const REPORT_DRAWING_SET_TOOL = {
  name: "report_drawing_set",
  description:
    "Report the set-level metadata and every individual sheet parsed from a structural drawing PDF. Call this tool exactly once with the complete result.",
  input_schema: {
    type: "object",
    properties: {
      setMeta: {
        type: "object",
        description: "Cover-sheet / package-level metadata for the whole drawing set.",
        properties: {
          setName:     { type: "string", description: "Name of this drawing package (e.g. '100% CD Set', 'IFB Package', 'Addendum 3'). Empty string if unknown." },
          revision:    { type: "string", description: "Package-level revision or issuance tag (e.g. 'Rev 2', 'IFC', 'Addendum 3'). Empty string if unknown." },
          issueDate:   { type: "string", description: "Package issue date in ISO YYYY-MM-DD format. Empty string if unknown." },
          issuedBy:    { type: "string", description: "Issuing firm / engineer of record. Empty string if unknown." },
          discipline:  { type: "string", description: "Primary discipline of the set. One of Structural, Arch, MEP, Civil, Misc Metals, or empty string." },
          projectName: { type: "string", description: "Project name as shown on the cover. Empty string if unknown." },
        },
        required: ["setName", "revision", "issueDate", "issuedBy", "discipline", "projectName"],
      },
      sheets: {
        type: "array",
        description: "One entry per individual sheet listed in the drawing index or detected in title blocks.",
        items: {
          type: "object",
          properties: {
            sheetNumber: { type: "string", description: "Sheet number EXACTLY as printed in the title block or drawing index, e.g. 'S-101', 'A201', 'M-2.1'. NEVER include the title. Empty string if the row has no sheet number." },
            sheetTitle:  { type: "string", description: "Sheet title only — the human-readable description like 'FIRST FLOOR PLAN'. MUST NOT contain the sheet number." },
            discipline:  { type: "string", description: "One of: Structural, Arch, MEP, Civil, Misc Metals. Infer from the sheet number prefix: S=Structural, A=Arch, C=Civil, M/P/E=MEP, G=General (use Misc Metals for miscellaneous metal shop drawings)." },
            sheetType:   { type: "string", description: "One of: Plan, Elevation, Section, Detail, Schedule, General, Cover." },
            revision:    { type: "string", description: "PER-SHEET revision number as shown in the sheet's own title block (NOT the set-level revision). Use '0' only when no per-sheet revision is visible." },
            scale:       { type: "string", description: "Drawing scale (e.g. '1/4\" = 1\\'-0\"'). Empty string if not shown." },
            date:        { type: "string", description: "Per-sheet date in ISO YYYY-MM-DD format. Empty string if not shown." },
          },
          required: ["sheetNumber", "sheetTitle", "discipline", "sheetType", "revision", "scale", "date"],
        },
      },
    },
    required: ["setMeta", "sheets"],
  },
};

const SYSTEM_PROMPT = `You parse structural steel / construction drawing sets.

You will be given the plain-text content of a PDF drawing set, page by page. Text items are laid out to preserve the visual structure: items on the same visual row are joined by TABS (\\t) when they come from different columns and by SPACES when they belong to the same phrase. A drawing-index row therefore looks like:

  A201\\tFIRST FLOOR PLAN\\tSTRUCTURAL\\t11/04/25\\t2

Your job is to call the report_drawing_set tool EXACTLY ONCE with:

1. Set-level metadata from the cover sheet / title page (set name, package revision, issue date, issuing firm, project name).
2. Every individual sheet you can identify from the drawing index OR from per-sheet title blocks.

CRITICAL RULES — violating any of these is a failure:

SHEET NUMBER IDENTIFICATION:
- The sheetNumber is the ACTUAL SHEET IDENTIFIER from the title block (usually bottom-right corner of the drawing). It is the number that identifies THIS sheet, e.g. "E106", "S-101", "ABP1".
- DO NOT use section callouts, detail references, or cross-references as the sheet number. Text like "SEE S401", "DETAIL A/S401", "SECTION 2/S401", "S401" appearing in the drawing body as a reference to ANOTHER sheet is NOT this sheet's number.
- If the PDF text contains a mix of title-block text and drawing-body text, the title block is typically at the bottom or right edge of the page and contains: sheet number, sheet title, drawn by, checked by, date, revision, scale, project name.
- If only one page of content exists, the title block sheet number is authoritative. Ignore any other sheet-number-like tokens that appear in section marks, detail bubbles, or grid references.
- When the filename follows the pattern {digits}{letters}{digits}-R{rev} (e.g. "101E108-R1"), the letter+digit portion (e.g. "E108") is very likely the correct sheet number. Use this as a strong hint. If the PDF has only 1 page, the filename-derived sheet number is almost certainly correct — return exactly ONE sheet, not a list of references found in the body.
- Single-page PDFs contain EXACTLY ONE sheet. Do NOT return multiple sheets from a single-page PDF — any other sheet numbers visible on the page are cross-references to other drawings, not actual sheets in this file.

FIELD SEPARATION:
- The sheetNumber field contains ONLY the sheet number itself (e.g. "S-101", "A201", "M-2.1"). NEVER put the full "A201 FIRST FLOOR PLAN" string in sheetNumber. NEVER put "A201" or any sheet-number-like token in sheetTitle. They are SEPARATE fields.
- When a row starts with a sheet-number-shaped token (1-4 letters, optional separator, 1-4 digits, optional .decimal), that token is the sheetNumber. Everything after it on that row is the sheetTitle (or other fields).

REVISIONS AND DATES:
- The sheet-level "revision" field is the PER-SHEET revision from the sheet's own title block. If a sheet's title block shows a different revision than the cover sheet, use the per-sheet value. Do NOT copy the package revision into every sheet automatically.
- Dates go in ISO YYYY-MM-DD format (convert from MM/DD/YY if needed).

COMPLETENESS:
- If a sheet index exists, enumerate every single row — do not skip, summarize, or deduplicate. Prefer the index as the authoritative list.
- NEVER invent data. Use "" for any field you cannot read.
- Return EVERY sheet you find. Do not truncate.`;

function buildUserPrompt(extracted, fileName) {
  const filenameHint = fileName
    ? `\nThe source filename is "${fileName}". If the filename follows a pattern like {jobNumber}{sheetId}-R{rev} (e.g. "101E108-R1.pdf"), the sheetId portion (e.g. "E108") is the expected sheet number. Use this to validate what you find in the text.\n`
    : "";
  return `Here is the extracted text from a drawing set PDF.
${filenameHint}
${buildPdfTextBlock(extracted.pages)}

The PDF has ${extracted.pageCount} pages and ${extracted.totalChars} characters of extracted text.

Call report_drawing_set with every sheet you can identify and the set-level metadata.`;
}

// ─── Post-processing: deterministic cleanup after the LLM response ──
const SHEET_NUMBER_RE =
  /^([A-Z]{1,4}(?:[-. ]?\d{1,4})(?:\.\d+)?(?:[A-Z]{1,2})?)\b/;

/**
 * Normalize a single sheet record:
 *   - If sheetNumber is empty but sheetTitle starts with a sheet-number
 *     token, split it out of the title.
 *   - If sheetTitle starts with a duplicate of sheetNumber, strip it.
 *   - Uppercase the sheet number and collapse internal spaces.
 */
export function fixupSheet(raw) {
  const out = { ...raw };
  const rawSn    = String(out.sheetNumber || "").trim();
  const rawTitle = String(out.sheetTitle  || "").trim();

  let sheetNumber = rawSn;
  let sheetTitle  = rawTitle;

  // Case 1: sheetNumber is empty, but the title starts with a sheet number.
  if (!sheetNumber && sheetTitle) {
    const m = sheetTitle.match(SHEET_NUMBER_RE);
    if (m) {
      sheetNumber = m[1];
      sheetTitle  = sheetTitle.slice(m[0].length).replace(/^[\s\t\-—–:|,.]+/, "").trim();
    }
  }

  // Case 2: sheetNumber is present AND the title repeats it at the start.
  if (sheetNumber && sheetTitle) {
    // Build a regex that matches the sheet number with flexible separators:
    //   "S-101", "S 101", "S101", "S.101" all collide.
    const flexible = sheetNumber.replace(/[-. ]/g, "[-. ]?");
    const dupRe = new RegExp(`^${flexible}[\\s\\t\\-—–:|,.]*`, "i");
    sheetTitle = sheetTitle.replace(dupRe, "").trim();
  }

  // Case 3: if the title is EXACTLY the sheet number, clear the title.
  if (sheetNumber && sheetTitle.toUpperCase().replace(/[-. ]/g, "") ===
      sheetNumber.toUpperCase().replace(/[-. ]/g, "")) {
    sheetTitle = "";
  }

  // Normalize sheet number: uppercase + collapse internal whitespace.
  if (sheetNumber) {
    sheetNumber = sheetNumber.toUpperCase().replace(/\s+/g, "");
  }

  // Clip stray leading/trailing tabs the LLM may have carried over from
  // the columnar input.
  sheetTitle = sheetTitle.replace(/^[\t\s]+|[\t\s]+$/g, "");

  out.sheetNumber = sheetNumber;
  out.sheetTitle  = sheetTitle;
  return out;
}

/**
 * Deduplicate sheet records where the same sheetNumber appears multiple
 * times — the drawing index plus a per-page title block can produce two
 * rows for the same sheet. Keep the richest entry (most non-empty fields).
 */
function dedupeSheets(sheets) {
  const byNum = new Map();
  const orphanNoNumber = [];
  for (const s of sheets) {
    const key = String(s.sheetNumber || "").toUpperCase().replace(/[-. ]/g, "");
    if (!key) {
      orphanNoNumber.push(s);
      continue;
    }
    const existing = byNum.get(key);
    if (!existing) {
      byNum.set(key, s);
      continue;
    }
    // Keep whichever record has more populated fields.
    const score = (rec) =>
      (rec.sheetTitle ? 1 : 0) +
      (rec.discipline ? 1 : 0) +
      (rec.sheetType  ? 1 : 0) +
      (rec.revision   ? 1 : 0) +
      (rec.scale      ? 1 : 0) +
      (rec.date       ? 1 : 0);
    if (score(s) > score(existing)) byNum.set(key, s);
  }
  return [...byNum.values(), ...orphanNoNumber];
}

// ─── Public API ──────────────────────────────────────────────────────
/**
 * Extract structured drawing-set data from a PDF file.
 *
 * Never throws — errors are returned as part of the result object so the
 * caller (upload modal) can surface a clean fallback row.
 *
 * @param {File} file  the browser File
 * @returns {Promise<{
 *   setMeta:       object,
 *   sheets:        Array,
 *   scanned:       boolean,
 *   extractFailed: boolean,
 *   error?:        string,
 *   pageCount?:    number,
 * }>}
 */
export async function extractSheetsFromPdf(file) {
  // 1. Client-side PDF text extraction.
  let extracted;
  try {
    extracted = await extractPdfText(file);
  } catch (pdfErr) {
    console.error("[pdfSheetExtractor] pdfjs failed:", pdfErr);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [makeManualEntryRow(file, "PDF text extraction failed — please fill in sheet details manually.")],
      scanned: false,
      extractFailed: true,
      error: pdfErr?.message || String(pdfErr),
    };
  }

  // Scanned PDF — no embedded text at all.
  if (extracted.scanned) {
    return {
      setMeta: { ...EMPTY_SET_META, setName: stripExt(file.name) },
      sheets: [makeManualEntryRow(file, "Scanned PDF — no extractable text. Please fill in sheet details manually.")],
      scanned: true,
      extractFailed: false,
      pageCount: extracted.pageCount,
    };
  }

  // 2. Call Claude with tool-use for forced structured output.
  //    Retry on 429 rate-limit errors with exponential backoff.
  let llmResult;
  for (let attempt = 0; ; attempt++) {
    try {
      llmResult = await base44.integrations.Core.InvokeLLM({
        system:     SYSTEM_PROMPT,
        prompt:     buildUserPrompt(extracted, file.name),
        tools:      [REPORT_DRAWING_SET_TOOL],
        tool_choice:{ type: "tool", name: "report_drawing_set" },
        maxTokens:  8000,
        temperature: 0,
      });
    } catch (err) {
      const is429 = /429|rate.limit/i.test(err?.message || String(err));
      if (is429 && attempt < MAX_LLM_RETRIES) {
        const waitMs = LLM_RETRY_BASE_MS * Math.pow(1.5, attempt);
        console.warn(`[pdfSheetExtractor] 429 rate-limit (attempt ${attempt + 1}/${MAX_LLM_RETRIES}), retrying in ${(waitMs / 1000).toFixed(0)}s…`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.error("[pdfSheetExtractor] InvokeLLM threw:", err);
      return {
        setMeta: { ...EMPTY_SET_META },
        sheets: [makeManualEntryRow(file, `AI extraction failed: ${err?.message || String(err)}`)],
        scanned: false,
        extractFailed: true,
        error: err?.message || String(err),
        pageCount: extracted.pageCount,
      };
    }

    // Always log the response shape — when extraction silently fails, this is
    // what tells you whether the proxy returned tool_use, plain text, or an
    // error envelope. Cheap and decisive in DevTools.
    console.info("[pdfSheetExtractor] llm response shape:", {
      hasToolUse:       Boolean(llmResult?.tool_use),
      hasText:          Boolean(llmResult?.text),
      hasError:         Boolean(llmResult?.error),
      protocolVersion:  llmResult?.protocol_version ?? null,
      textLength:       typeof llmResult?.text === "string" ? llmResult.text.length : 0,
    });

    // Edge function returns { error } on failure — check for retryable 429.
    if (llmResult?.error) {
      const errStr = String(llmResult.error);
      const is429 = /429|rate.limit/i.test(errStr);
      if (is429 && attempt < MAX_LLM_RETRIES) {
        const waitMs = LLM_RETRY_BASE_MS * Math.pow(1.5, attempt);
        console.warn(`[pdfSheetExtractor] 429 rate-limit (attempt ${attempt + 1}/${MAX_LLM_RETRIES}), retrying in ${(waitMs / 1000).toFixed(0)}s…`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.error("[pdfSheetExtractor] llm-proxy error:", llmResult.error);
      return {
        setMeta: { ...EMPTY_SET_META },
        sheets: [makeManualEntryRow(file, `AI unavailable: ${llmResult.error}`)],
        scanned: false,
        extractFailed: true,
        error: llmResult.error,
        pageCount: extracted.pageCount,
      };
    }

    // Success — break out of the retry loop
    break;
  }

  // Stale-deployment detection. We forced tool_choice on the request, so a
  // healthy edge function MUST come back with a tool_use block. If it doesn't,
  // and the response also lacks the v3+ protocol_version marker, the deployed
  // edge function is older than the codebase and needs to be redeployed.
  // v3 is the deploy where verify_jwt was turned off — without that the POST
  // never even reaches the function code. Surface that EXACT diagnosis
  // instead of a generic JSON-parse failure.
  if (!llmResult?.tool_use && (Number(llmResult?.protocol_version) || 0) < 3) {
    const msg =
      "The deployed Supabase llm-proxy edge function is out of date — it either " +
      "ignored the tool-use request or is still gated by verify_jwt. Run " +
      "`supabase functions deploy llm-proxy --no-verify-jwt` (or redeploy via the " +
      "Supabase dashboard with verify_jwt off), then retry the upload.";
    console.error("[pdfSheetExtractor] stale edge function detected. Raw text was:",
      typeof llmResult?.text === "string" ? llmResult.text.slice(0, 500) : llmResult);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [makeManualEntryRow(file, msg)],
      scanned: false,
      extractFailed: true,
      error: msg,
      pageCount: extracted.pageCount,
    };
  }

  // 3. Pull structured output — prefer tool_use.input, fall back to parsing text.
  let parsed;
  if (llmResult?.tool_use?.input && typeof llmResult.tool_use.input === "object") {
    parsed = llmResult.tool_use.input;
  } else {
    const rawText = typeof llmResult === "string"
      ? llmResult
      : (llmResult?.text ?? llmResult?.content ?? "");
    try {
      parsed = JSON.parse(String(rawText || "{}"));
    } catch (parseErr) {
      console.error("[pdfSheetExtractor] JSON parse failed:", parseErr, "\nraw:", rawText);
      return {
        setMeta: { ...EMPTY_SET_META },
        sheets: [makeManualEntryRow(file, "AI response was not valid JSON — manual entry required")],
        scanned: false,
        extractFailed: true,
        error: "AI response was not valid JSON",
        pageCount: extracted.pageCount,
      };
    }
  }

  const setMeta = { ...EMPTY_SET_META, ...(parsed?.setMeta || {}) };
  const rawSheets = Array.isArray(parsed?.sheets) ? parsed.sheets : [];

  // 4. Deterministic post-processing — splits sheet# out of title, dedupes,
  //    normalizes. This is the safety net: if the model slips up and
  //    produces "sheetNumber: ''" with the title containing "A201 Plan",
  //    fixupSheet puts things right.
  const fixed = rawSheets.map(fixupSheet);
  let sheets = dedupeSheets(fixed);

  // 5. Filename cross-check — when the filename encodes a sheet number
  //    (e.g. 502E109-R1.pdf → E109), validate the AI result and correct
  //    common mis-extractions. Single-page PDFs are ONE sheet; if the AI
  //    returned a whole drawing index from references found on the page,
  //    keep only the entry matching the filename.
  const filenameParsed = parseFilename(file.name);
  if (filenameParsed.sheetNumber) {
    const fnSn = filenameParsed.sheetNumber.toUpperCase().replace(/[-. ]/g, "");

    if (extracted.pageCount === 1 && sheets.length > 1) {
      // Single-page PDF but AI returned multiple sheets (read a drawing index
      // or detail references). Keep only the one matching the filename.
      const match = sheets.find(s =>
        (s.sheetNumber || "").toUpperCase().replace(/[-. ]/g, "") === fnSn
      );
      if (match) {
        sheets = [match];
        console.info(`[pdfSheetExtractor] Single-page PDF returned ${fixed.length} sheets — kept filename match "${filenameParsed.sheetNumber}"`);
      } else {
        // No match — override the first entry with the filename sheet number
        sheets = [{ ...sheets[0], sheetNumber: filenameParsed.sheetNumber }];
        console.info(`[pdfSheetExtractor] Single-page PDF returned ${fixed.length} sheets — none matched filename, using "${filenameParsed.sheetNumber}"`);
      }
    } else if (sheets.length === 1) {
      // Single sheet returned — if the AI's sheet number doesn't match the
      // filename, the filename is more trustworthy (AI often picks up detail
      // section references like "S401" instead of the title-block number).
      const aiSn = (sheets[0].sheetNumber || "").toUpperCase().replace(/[-. ]/g, "");
      if (aiSn && aiSn !== fnSn) {
        console.info(`[pdfSheetExtractor] AI returned "${sheets[0].sheetNumber}" but filename says "${filenameParsed.sheetNumber}" — using filename`);
        sheets[0] = { ...sheets[0], sheetNumber: filenameParsed.sheetNumber };
      } else if (!aiSn) {
        sheets[0] = { ...sheets[0], sheetNumber: filenameParsed.sheetNumber };
      }
    }

    // Apply filename-derived revision if AI didn't find one
    if (filenameParsed.revision && filenameParsed.revision !== "0") {
      sheets.forEach((s, i) => {
        if (!s.revision || s.revision === "0") {
          sheets[i] = { ...s, revision: filenameParsed.revision };
        }
      });
    }
  }

  return {
    setMeta,
    sheets,
    scanned: false,
    extractFailed: false,
    pageCount: extracted.pageCount,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────
function stripExt(name) {
  return String(name || "").replace(/\.pdf$/i, "");
}

/**
 * Parse a drawing filename into structured fields.
 *
 * Common patterns in steel fabrication:
 *   101E108-R1.pdf   → { sheetNumber: "E108", revision: "1" }
 *   24426S201-R2.pdf → { sheetNumber: "S201", revision: "2" }
 *   S-101.pdf        → { sheetNumber: "S-101", revision: "0" }
 *   101ABP2-RA.pdf   → { sheetNumber: "ABP2", revision: "A" }
 *
 * The leading numeric prefix (job number) is stripped so the sheet
 * number matches what users expect in the drawings table.
 */
export function parseFilename(name) {
  const stem = stripExt(name);
  const result = { sheetNumber: "", revision: "0", baseName: stem };

  // Try: {digits}{Letter(s)}{digits/chars}-R{rev}
  // e.g. 101E108-R1, 24426S201-RA, 101ABP2-R0
  const m1 = stem.match(/^\d{3,6}([A-Z]{1,4}\d{1,4}[A-Z]?)\s*[-_]\s*R([A-Z0-9]+)$/i);
  if (m1) {
    result.sheetNumber = m1[1].toUpperCase();
    result.revision = m1[2];
    return result;
  }

  // Try: {Letter(s)}{sep?}{digits}-R{rev}  (no job prefix)
  // e.g. S-101-R2, E108-R1
  const m2 = stem.match(/^([A-Z]{1,4}[-. ]?\d{1,4}(?:\.\d+)?)\s*[-_]\s*R([A-Z0-9]+)$/i);
  if (m2) {
    result.sheetNumber = m2[1].toUpperCase();
    result.revision = m2[2];
    return result;
  }

  // Try: {digits}{Letter(s)}{digits} (no revision suffix)
  // e.g. 101E108
  const m3 = stem.match(/^\d{3,6}([A-Z]{1,4}\d{1,4}[A-Z]?)$/i);
  if (m3) {
    result.sheetNumber = m3[1].toUpperCase();
    return result;
  }

  // Try: plain sheet number  e.g. S-101, A201
  const m4 = stem.match(/^([A-Z]{1,4}[-. ]?\d{1,4}(?:\.\d+)?)$/i);
  if (m4) {
    result.sheetNumber = m4[1].toUpperCase();
    return result;
  }

  return result;
}

function makeManualEntryRow(file, note) {
  const parsed = parseFilename(file.name);
  return {
    sheetNumber: parsed.sheetNumber,
    sheetTitle:  parsed.sheetNumber ? "" : stripExt(file.name),
    discipline:  "Structural",
    sheetType:   "General",
    revision:    parsed.revision || "0",
    scale:       "",
    date:        "",
    _note:       note + (parsed.sheetNumber ? ` (sheet # "${parsed.sheetNumber}" extracted from filename)` : ""),
  };
}
