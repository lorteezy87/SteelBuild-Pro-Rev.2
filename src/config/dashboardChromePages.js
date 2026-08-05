import { PAGES } from "@/config/routes";

// All registered pages use dashboard reference chrome on desktop.
export const REFERENCE_CHROME_PAGES = new Set(Object.keys(PAGES));

export const isReferenceChromePage = (pageName) => REFERENCE_CHROME_PAGES.has(pageName);