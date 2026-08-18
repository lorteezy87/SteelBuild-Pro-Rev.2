import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractTextFromRect } from "@/lib/pdfTitleblockText";
import { normalizeTitleblockRevision, parseTitleblockRect } from "@/lib/titleblock";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Overlay per-sheet revision from the marked titleblock Rev rectangle.
 * Uses each sheet's pdfPage when present; otherwise page index + 1.
 */
export async function applyTitleblockRevisionOcr(file, sheets, revisionRectRaw) {
  const revisionRect = parseTitleblockRect(revisionRectRaw);
  if (!revisionRect || !file || !Array.isArray(sheets) || sheets.length === 0) return sheets;

  let pdf;
  try {
    const buf = await readFileAsArrayBuffer(file);
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (err) {
    console.warn("[applyTitleblockRevisionOcr] PDF load failed:", err?.message);
    return sheets;
  }

  try {
    const out = [...sheets];
    for (let i = 0; i < out.length; i++) {
      const pageNum = Number.isFinite(out[i]?.pdfPage) && out[i].pdfPage >= 1
        ? Math.min(out[i].pdfPage, pdf.numPages)
        : Math.min(i + 1, pdf.numPages);
      try {
        const page = await pdf.getPage(pageNum);
        const raw = await extractTextFromRect(page, revisionRect);
        const revision = normalizeTitleblockRevision(raw);
        if (revision) out[i] = { ...out[i], revision };
      } catch (pageErr) {
        console.warn(`[applyTitleblockRevisionOcr] page ${pageNum} failed:`, pageErr?.message);
      }
    }
    return out;
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
}
