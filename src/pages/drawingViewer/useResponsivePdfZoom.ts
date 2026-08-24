import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

type FitMode = "page" | "width" | null;

type PdfViewport = {
  width: number;
  height: number;
};

type PdfPage = {
  getViewport: (options: { scale: number; rotation: number }) => PdfViewport;
};

type PdfDocument = {
  numPages?: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type Size = {
  width: number;
  height: number;
};

type FitZoomOptions = {
  viewport: Size;
  page: Size;
  padding: number;
  mode: Exclude<FitMode, null>;
};

const DEFAULT_PAGE_PADDING = 40;
const PAGE_BORDER_ALLOWANCE = 2;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;

export function calculateFitZoom({ viewport, page, padding, mode }: FitZoomOptions): number | null {
  if (
    !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || !Number.isFinite(page.width)
    || !Number.isFinite(page.height)
    || viewport.width <= 0
    || viewport.height <= 0
    || page.width <= 0
    || page.height <= 0
  ) {
    return null;
  }

  const reservedSpace = Math.max(0, padding) * 2 + PAGE_BORDER_ALLOWANCE;
  const widthScale = Math.max(1, viewport.width - reservedSpace) / page.width;
  const heightScale = Math.max(1, viewport.height - reservedSpace) / page.height;
  const rawScale = mode === "width" ? widthScale : Math.min(widthScale, heightScale);
  const clampedScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawScale));

  // Never round upward: even a one-pixel overshoot reintroduces a scrollbar
  // and makes the title-block edge disappear at some viewport sizes.
  return Math.floor(clampedScale * 100) / 100;
}

function readPagePadding(viewport: HTMLElement): number {
  const rawValue = window
    .getComputedStyle(viewport)
    .getPropertyValue("--viewer-paper-padding")
    .trim();
  const parsedValue = Number.parseFloat(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : DEFAULT_PAGE_PADDING;
}

export function useResponsivePdfZoom({
  pdfDoc,
  currentPage,
  rotation,
}: {
  pdfDoc: PdfDocument | null;
  currentPage: number;
  rotation: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>("page");
  const [pageSize, setPageSize] = useState<Size | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPageSize(null);
    if (!pdfDoc) return () => { cancelled = true; };

    const requestedPage = Math.max(1, Number(currentPage) || 1);
    const pageCount = Number(pdfDoc.numPages);
    const safePage = Number.isFinite(pageCount) && pageCount >= 1
      ? Math.min(pageCount, requestedPage)
      : requestedPage;

    void pdfDoc.getPage(safePage)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1, rotation });
        setPageSize({ width: viewport.width, height: viewport.height });
        setFitMode("page");
      })
      .catch(() => {
        // The PDF loader/renderer owns the user-visible error state. Keeping
        // sizing empty here avoids a second unhandled rejection from auto-fit.
        if (!cancelled) setPageSize(null);
      });

    return () => { cancelled = true; };
  }, [currentPage, pdfDoc, rotation]);

  const applyFit = useCallback((mode: Exclude<FitMode, null>) => {
    const viewport = viewportRef.current;
    if (!viewport || !pageSize) return;

    const fittedZoom = calculateFitZoom({
      viewport: { width: viewport.clientWidth, height: viewport.clientHeight },
      page: pageSize,
      padding: readPagePadding(viewport),
      mode,
    });
    if (fittedZoom == null) return;
    setZoomState((currentZoom) => currentZoom === fittedZoom ? currentZoom : fittedZoom);
  }, [pageSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !pageSize || !fitMode) return undefined;

    const update = () => applyFit(fitMode);
    update();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [applyFit, fitMode, pageSize]);

  const setZoom = useCallback((value: SetStateAction<number>) => {
    setFitMode(null);
    setZoomState(value);
  }, []);

  const fitPage = useCallback(() => {
    setFitMode("page");
    applyFit("page");
  }, [applyFit]);

  const fitWidth = useCallback(() => {
    setFitMode("width");
    applyFit("width");
  }, [applyFit]);

  return {
    zoom,
    setZoom,
    viewportRef,
    fitPage,
    fitWidth,
  };
}
