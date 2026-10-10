/**
 * useCraneLibrary — one organization's crane fleet as React state, persisted on
 * every change. Switching organization swaps the fleet in the same render, so a
 * pick is never shown against another company's charts, not even for a frame.
 */
import { useCallback, useState } from "react";
import { loadLibrary, saveLibrary, type CraneRecord } from "@/lib/crane/craneLibrary";

export interface CraneLibraryState {
  cranes: CraneRecord[];
  /** Replace the fleet and persist it. */
  setCranes: (next: CraneRecord[]) => void;
  /** True when the last write was refused (quota, private mode) — the change lives only in memory. */
  saveFailed: boolean;
  /** False with no active organization: nothing is loaded and nothing can be saved. */
  hasOrg: boolean;
}

interface Held {
  orgId: string | null;
  cranes: CraneRecord[];
  saveFailed: boolean;
}

export default function useCraneLibrary(orgId: string | null): CraneLibraryState {
  const [held, setHeld] = useState<Held>(() => ({ orgId, cranes: loadLibrary(orgId), saveFailed: false }));

  let current = held;
  if (held.orgId !== orgId) {
    current = { orgId, cranes: loadLibrary(orgId), saveFailed: false };
    setHeld(current);
  }

  const setCranes = useCallback((next: CraneRecord[]) => {
    setHeld({ orgId, cranes: next, saveFailed: !saveLibrary(next, orgId) });
  }, [orgId]);

  return { cranes: current.cranes, setCranes, saveFailed: current.saveFailed, hasOrg: !!orgId };
}
