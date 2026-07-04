import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { detectScaleFromPdf } from "@/components/drawings/viewer/detectScale";

// Auto-detect scale from the PDF's title block text layer. Two paths, both
// extracted verbatim from DrawingViewer.jsx (behaviour byte-identical):
//
//   1. Toolbar AUTO button → handleAutoDetectScale() returned below.
//      Explicit, always toasts the result, overrides any existing scale.
//      Useful when a user wants to force a re-detection.
//
//   2. Automatic on-load effect. Fires once per drawing-with-no-calibration
//      after the PDF loads. Only applies on HIGH confidence matches (arch
//      scale notation like 1/4"=1'-0"), never on the low-confidence metric
//      fallback — metric ratios are often used for key maps / inset details
//      and would silently misconfigure the sheet. Toast includes an UNDO
//      action so a mis-detect is one click away from being reverted.
//
// Owns the per-session dedup ref (autoScaleAttemptedRef) internally so quickly
// switching drawings doesn't spam toasts. Returns { handleAutoDetectScale } so
// the page can wire the toolbar AUTO button exactly as before.
export function useAutoScaleOnLoad({ activeDrawing, pdfDoc, projectId, qc }) {
  const handleAutoDetectScale = useCallback(async () => {
    if (!activeDrawing?.id || !pdfDoc) return;
    try {
      const hit = await detectScaleFromPdf(pdfDoc);
      if (!hit) {
        toast.info("No scale pattern found in the PDF text layer. Use Calibrate (K) to set manually.");
        return;
      }
      await entities.Drawing.update(activeDrawing.id, { markup_scale: hit.scale });
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      const confidence = hit.confidence === "high" ? "" : " (low confidence — verify with Calibrate if needed)";
      toast.success(`Detected scale ${hit.label} on page ${hit.page}${confidence}`);
    } catch (err) {
      toast.error(`Auto-detect failed: ${err.message}`);
    }
  }, [activeDrawing, pdfDoc, projectId, qc]);

  // Fire auto-detect the first time we see an uncalibrated drawing with
  // a loaded PDF. Per-session dedup via autoScaleAttemptedRef so quickly
  // switching drawings doesn't spam toasts. Skips entirely when the
  // drawing already has a markup_scale (manual or prior auto).
  const autoScaleAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!pdfDoc || !activeDrawing?.id) return;
    if (activeDrawing.markup_scale) return;
    if (autoScaleAttemptedRef.current.has(activeDrawing.id)) return;
    autoScaleAttemptedRef.current.add(activeDrawing.id);

    let cancelled = false;
    (async () => {
      try {
        const hit = await detectScaleFromPdf(pdfDoc);
        if (cancelled || !hit || hit.confidence !== "high") return;
        await entities.Drawing.update(activeDrawing.id, { markup_scale: hit.scale });
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        const drawingIdForUndo = activeDrawing.id;
        toast.success(`Auto-detected scale ${hit.label}`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await entities.Drawing.update(drawingIdForUndo, { markup_scale: null });
                qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                toast.info("Scale reset — use Calibrate (K) to set manually.");
              } catch (err) {
                toast.error(`Undo failed: ${err.message}`);
              }
            },
          },
        });
      } catch {
        // Silent — auto-path should not spam errors. User can still
        // click AUTO on the toolbar for explicit feedback.
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, activeDrawing?.id, activeDrawing?.markup_scale, projectId, qc]);

  return { handleAutoDetectScale };
}
