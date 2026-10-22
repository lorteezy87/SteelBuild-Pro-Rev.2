/**
 * The written-notice window for delays, in working days, per project.
 *
 * Notice clauses differ by subcontract, so this is a per-viewer setting kept in
 * localStorage (a convenience, not a record): the Delay Log and Command
 * Center's field gate read the same value. Defaults to two working days.
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_NOTICE_WINDOW_DAYS } from "@/lib/fieldOversight";

const key = (projectId: string) => `sbp-delay-notice-window:${projectId}`;

export function readNoticeWindow(projectId: string | null | undefined): number {
  if (!projectId) return DEFAULT_NOTICE_WINDOW_DAYS;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 30 ? n : DEFAULT_NOTICE_WINDOW_DAYS;
  } catch {
    return DEFAULT_NOTICE_WINDOW_DAYS;
  }
}

export function useNoticeWindow(projectId: string | null | undefined): [number, (n: number) => void] {
  const [value, setValue] = useState(() => readNoticeWindow(projectId));
  useEffect(() => { setValue(readNoticeWindow(projectId)); }, [projectId]);
  const set = useCallback((n: number) => {
    if (!Number.isInteger(n) || n < 0 || n > 30) return;
    setValue(n);
    if (!projectId) return;
    try { window.localStorage.setItem(key(projectId), String(n)); } catch { /* storage unavailable */ }
  }, [projectId]);
  return [value, set];
}
