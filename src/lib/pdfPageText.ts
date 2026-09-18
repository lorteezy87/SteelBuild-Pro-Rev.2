/**
 * pdfPageText.ts — harvest the plain text of every page of a PDF.
 *
 * Used by the Document Control page to give the seal detector something to read.
 * `pdfSheetExtractor` builds its own column-aware text for the language model
 * and does not expose it; this is a deliberately small, separate read, because
 * seal detection only needs the words on the page, not their layout.
 *
 * Never throws. A PDF that will not open, or a page that will not render, yields
 * no text for that page — and the caller then reports the seal as unverifiable,
 * which is the truthful answer when nothing could be read.
 */

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Upper bound on pages read, so a 900-page bid set cannot lock the tab. */
export const MAX_PAGE_TEXT_PAGES = 200;

type TextItemLike = { str?: unknown };

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("FileReader did not return an ArrayBuffer"));
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Text of each page, keyed by 1-indexed PDF page number.
 *
 * A page with no text layer is simply absent from the map — it is NOT stored as
 * an empty string. The distinction matters downstream: an absent key means the
 * page was never readable, which must not be mistaken for a page that was read
 * and carried no seal.
 */
export async function readPdfPageTexts(
  file: File | null | undefined,
  maxPages = MAX_PAGE_TEXT_PAGES,
): Promise<Record<number, string>> {
  if (!file) return {};

  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null = null;
  try {
    const buffer = await readFileAsArrayBuffer(file);
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (err) {
    console.warn("[readPdfPageTexts] PDF load failed:", (err as Error)?.message);
    return {};
  }

  const out: Record<number, string> = {};
  try {
    const pageCount = Math.min(pdf.numPages, Math.max(1, maxPages));
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const text = (content.items as TextItemLike[])
          .map((item) => (typeof item?.str === "string" ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) out[pageNum] = text;
      } catch (pageErr) {
        console.warn(`[readPdfPageTexts] page ${pageNum} failed:`, (pageErr as Error)?.message);
      }
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }

  return out;
}
