/** Read the true PDF length before accepting a human-entered source page. */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function readPdfPageCount(file: File): Promise<number | null> {
  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]> | null = null;
  try {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error("PDF bytes were unavailable"));
      reader.onerror = () => reject(reader.error || new Error("PDF read failed"));
      reader.readAsArrayBuffer(file);
    });
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    return Number.isInteger(pdf.numPages) && pdf.numPages > 0 ? pdf.numPages : null;
  } catch {
    return null;
  } finally {
    if (pdf) {
      try { await pdf.destroy(); } catch { /* Page count remains valid. */ }
    }
  }
}
