import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { detectScaleFromPdf } from "@/components/drawings/viewer/detectScale";
import { getActiveOrgGeneration } from "@/lib/activeOrg";

// Lifetime fences discard stale callbacks; the conditional UPDATE independently
// checks the server's source, version and prior scale in one statement.
export function useAutoScaleOnLoad({ activeDrawing, pdfDoc, projectId, qc, canCalibrate = false, actorId = null, currentPage, renderReady = false }) {
  const identity = JSON.stringify([projectId, activeDrawing?.id, activeDrawing?.file_url,
    activeDrawing?.pdf_page, activeDrawing?.revision_number, currentPage, actorId, canCalibrate, renderReady, getActiveOrgGeneration()]);
  const lifetime = useRef({ identity });
  if (lifetime.current.identity !== identity) lifetime.current = { identity };
  const token = lifetime.current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const generation = getActiveOrgGeneration();
  const assertCalibrationReady = useCallback(() => {
    if (!mounted.current || lifetime.current !== token || getActiveOrgGeneration() !== generation) {
      throw new Error("Drawing context changed. Reload the reviewed sheet before calibrating.");
    }
    if (!canCalibrate || !actorId) throw new Error("PM metadata permission is required to calibrate this sheet.");
    const page = activeDrawing?.pdf_page;
    if (!renderReady || !pdfDoc || !Number.isInteger(page) || page < 1 || page > pdfDoc.numPages || page !== currentPage) {
      throw new Error("Select the registered PDF page and wait for it to load before calibrating.");
    }
    if (activeDrawing.project_id !== projectId) throw new Error("Drawing project changed. Reload the sheet.");
  }, [token, generation, canCalibrate, actorId, activeDrawing, pdfDoc, currentPage, projectId, renderReady]);
  const saveCalibration = useCallback(async (scale) => {
    assertCalibrationReady();
    const saved = await entities.Drawing.updateCalibration(activeDrawing.id, scale, activeDrawing);
    assertCalibrationReady();
    qc.invalidateQueries({ queryKey: ["drawings", projectId] });
    return saved;
  }, [assertCalibrationReady, activeDrawing, qc, projectId]);
  const detectReviewedPage = useCallback(async () => {
    assertCalibrationReady();
    const page = activeDrawing.pdf_page;
    const hit = await detectScaleFromPdf({ numPages: 1, getPage: () => pdfDoc.getPage(page) });
    assertCalibrationReady();
    return hit ? { ...hit, page } : null;
  }, [assertCalibrationReady, activeDrawing, pdfDoc]);

  const handleAutoDetectScale = useCallback(async () => {
    try {
      const hit = await detectReviewedPage();
      if (!hit) { toast.info("No scale pattern found on this sheet. Use Calibrate (K) to set manually."); return; }
      await saveCalibration(hit.scale);
      toast.success(`Detected scale ${hit.label} on page ${hit.page}${hit.confidence === "high" ? "" : " (low confidence — verify with Calibrate)"}`);
    } catch (err) { toast.error(`Auto-detect held: ${err.message}`); }
  }, [detectReviewedPage, saveCalibration]);

  const attempted = useRef(new Set());
  useEffect(() => {
    if (!pdfDoc || activeDrawing?.markup_scale || !canCalibrate || !actorId) return;
    try { assertCalibrationReady(); } catch { return; }
    if (attempted.current.has(identity)) return;
    attempted.current.add(identity);
    let cancelled = false;
    (async () => {
      try {
        const hit = await detectReviewedPage();
        if (cancelled || !hit || hit.confidence !== "high") return;
        const saved = await saveCalibration(hit.scale);
        if (cancelled) return;
        toast.success(`Auto-detected scale ${hit.label} on page ${hit.page}`, {
          duration: 8000,
          action: { label: "Undo", onClick: async () => {
            try {
              assertCalibrationReady();
              await entities.Drawing.updateCalibration(saved.id, activeDrawing.markup_scale, saved);
              assertCalibrationReady();
              qc.invalidateQueries({ queryKey: ["drawings", projectId] });
              toast.info("Scale reset — use Calibrate (K) to set manually.");
            } catch (err) { toast.error(`Undo held: ${err.message}`); }
          } },
        });
      } catch { /* Explicit AUTO / Calibrate provides actionable feedback. */ }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, activeDrawing, canCalibrate, actorId, identity, assertCalibrationReady, detectReviewedPage, saveCalibration, qc, projectId]);
  return { handleAutoDetectScale, saveCalibration, assertCalibrationReady };
}
