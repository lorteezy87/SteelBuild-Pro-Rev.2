import React, { useEffect, useRef, useCallback } from "react";

export default function PDFRenderer({ fileUrl, currentPage, zoomLevel, canvasRef, onTotalPages }) {
  const pdfDocRef = useRef(null);

  const renderPage = useCallback(async (pdf, pageNum, zoom) => {
    if (!canvasRef.current || !pdf) return;

    try {
      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Render at device pixel ratio for crisp display on retina screens
      const dpr = window.devicePixelRatio || 1;
      const scale = zoom * dpr;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error("Failed to render page:", err);
    }
  }, [canvasRef]);

  const loadPDF = useCallback(async () => {
    try {
      const pdf = await window.pdfjsLib.getDocument(fileUrl).promise;
      pdfDocRef.current = pdf;
      if (onTotalPages) onTotalPages(pdf.numPages);
      await renderPage(pdf, currentPage, zoomLevel);
    } catch (err) {
      console.error("Failed to load PDF:", err);
    }
  }, [fileUrl, currentPage, zoomLevel, onTotalPages, renderPage]);

  useEffect(() => {
    if (!window.pdfjsLib) {
      // Load PDF.js from CDN
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        loadPDF();
      };
      document.head.appendChild(script);
    } else {
      loadPDF();
    }
  }, [loadPDF]);

  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage, zoomLevel);
    }
  }, [currentPage, zoomLevel, renderPage]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
      }}
    />
  );
}