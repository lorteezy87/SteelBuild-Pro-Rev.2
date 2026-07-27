import { useState, useEffect } from "react";
import { viewportWidth } from "@/lib/browser";

export type ViewportBand = "phone" | "tablet" | "desktop";

export const PHONE_MAX = 767;
export const TABLET_MAX = 1023;

export function bandForWidth(width: number): ViewportBand {
  if (width <= PHONE_MAX) return "phone";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
}

export function useResponsiveBreakpoint() {
  const [band, setBand] = useState<ViewportBand>(() => bandForWidth(viewportWidth()));

  useEffect(() => {
    const handler = () => setBand(bandForWidth(viewportWidth()));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isPhone = band === "phone";
  const isTablet = band === "tablet";
  const isDesktop = band === "desktop";
  return {
    band,
    isPhone,
    isTablet,
    isDesktop,
    isMobile: isPhone,
  };
}
