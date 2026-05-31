import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { resolveFileUrl } from "@/api/supabaseClient";
import { extractStoragePathFromSignedUrl } from "@/components/drawings/viewer/storageUrl";

// Resolves the active drawing's `file_url` to a signed URL and (when the
// caller is rendering in canvas mode) loads it as a pdfjs document. Owns
// the network-y side of the viewer so the page component can focus on
// rendering / coordination.
//
// Behaviour matches the previous inline effects byte-for-byte:
//   1. When file_url changes, reset everything and re-sign. Stale signed
//      URLs are unwound back to the storage path before re-signing.
//   2. When resolvedUrl changes (and we're in canvas mode), open the PDF
//      with pdfjs and clamp currentPage to the active drawing's pdf_page.
//   3. The previous PDF document is destroy()'d when a new one replaces it
//      to avoid leaking ArrayBuffers / fragments between sheets.
//
// Returns:
//   resolvedUrl, pdfDoc, totalPages, pdfError, currentPage, setCurrentPage,
//   setPdfError. The page also pokes setPdfError for one external case
//   (pdfjs render failure inside renderPage), which is why it leaks out.
export function usePdfLoader({ activeDrawing, renderMode }) {
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfError, setPdfError] = useState(null);

  // Resolve file_url (storage path) to a signed URL.
  // If file_url is a stale Supabase signed URL, extract the path and re-sign.
  useEffect(() => {
    let cancelled = false;
    setResolvedUrl(null);
    setPdfDoc(null);
    setPdfError(null);
    setCurrentPage(1);
    setTotalPages(0);

    const rawUrl = activeDrawing?.file_url;
    if (!rawUrl) return;

    const isHttp = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
    const storagePath = isHttp ? extractStoragePathFromSignedUrl(rawUrl) : rawUrl;
    const toResolve = storagePath || rawUrl;

    resolveFileUrl(toResolve)
      .then((url) => { if (!cancelled) setResolvedUrl(url); })
      .catch((err) => {
        if (cancelled) return;
        // Fall back to raw URL — iframe may still load it
        if (isHttp) setResolvedUrl(rawUrl);
        else setPdfError(`Failed to resolve file URL: ${err.message}`);
      });

    return () => { cancelled = true; };
  }, [activeDrawing?.file_url]);

  // Load the PDF once we have a signed URL (only when canvas mode is active)
  useEffect(() => {
    if (!resolvedUrl || renderMode !== "canvas") return;

    let cancelled = false;
    let loadingTask = null;

    loadingTask = pdfjsLib.getDocument(resolvedUrl);
    loadingTask.promise
      .then((doc) => {
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setPdfError(null);
      })
      .catch((err) => {
        if (!cancelled) setPdfError(`PDF load failed: ${err.message}`);
      });

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy?.();
      }
    };
  }, [resolvedUrl, renderMode]);

  // Sync currentPage when activeDrawing changes or PDF loads
  useEffect(() => {
    if (!pdfDoc) return;
    const desired = Number(activeDrawing?.pdf_page) || 1;
    setCurrentPage(Math.max(1, Math.min(pdfDoc.numPages, desired)));
  }, [pdfDoc, activeDrawing?.pdf_page]);

  // Destroy previous PDF document to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy().catch(() => {});
      }
    };
  }, [pdfDoc]);

  return {
    resolvedUrl,
    pdfDoc,
    totalPages,
    pdfError,
    setPdfError,
    currentPage,
    setCurrentPage,
  };
}
