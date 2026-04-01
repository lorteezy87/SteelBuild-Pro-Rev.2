import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function createPageUrl(path = "") {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export const isIframe =
  typeof window !== "undefined" ? window.self !== window.top : false;
