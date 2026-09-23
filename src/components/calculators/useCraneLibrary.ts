/**
 * useCraneLibrary — the crane fleet as React state, persisted on every change.
 */
import { useCallback, useState } from "react";
import { loadLibrary, saveLibrary, type CraneRecord } from "@/lib/crane/craneLibrary";

export interface CraneLibraryState {
  cranes: CraneRecord[];
  /** Replace the fleet and persist it. */
  setCranes: (next: CraneRecord[]) => void;
  /** True when the last write was refused (quota, private mode) — the change lives only in memory. */
  saveFailed: boolean;
}

export default function useCraneLibrary(): CraneLibraryState {
  const [cranes, setState] = useState<CraneRecord[]>(() => loadLibrary());
  const [saveFailed, setSaveFailed] = useState(false);

  const setCranes = useCallback((next: CraneRecord[]) => {
    setState(next);
    setSaveFailed(!saveLibrary(next));
  }, []);

  return { cranes, setCranes, saveFailed };
}
