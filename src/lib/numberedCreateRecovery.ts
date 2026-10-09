import { getActiveOrgGeneration, subscribeActiveOrgChange } from '@/lib/activeOrg';

export type NumberedCreateRecovery = { operation: string; payload: Record<string, unknown> };
type ReservedRecovery = NumberedCreateRecovery & { reservation: number };
const uncertain = new Map<string, ReservedRecovery>();
const completed = new Map<string, Set<string>>();
let nextReservation = 0;
const keyFor = (namespace: string, projectId: string) => JSON.stringify([getActiveOrgGeneration(), namespace, projectId]);

// Session memory survives modal remounts, never an identity/workspace boundary
// or browser reload. After either boundary, reconcile the original register.
subscribeActiveOrgChange(() => { uncertain.clear(); completed.clear(); });

export function getNumberedCreateRecovery(namespace: string, projectId: string): NumberedCreateRecovery | null {
  const saved = uncertain.get(keyFor(namespace, projectId));
  return saved ? structuredClone({ operation: saved.operation, payload: saved.payload }) : null;
}

/** Reserve before dispatch; an absent token means another draft owns this slot. */
export function retainNumberedCreateRecovery(namespace: string, projectId: string, operation: string,
  payload: Record<string, unknown>, expectedGeneration: number): number | undefined {
  if (expectedGeneration !== getActiveOrgGeneration()) return;
  const key = keyFor(namespace, projectId);
  if (completed.get(key)?.has(operation)) return;
  const current = uncertain.get(key);
  if (current && current.operation !== operation) return;
  const reservation = ++nextReservation;
  uncertain.set(key, { operation, payload: structuredClone(payload), reservation });
  return reservation;
}

/** Only the latest attempt may release its definite rejection for correction. */
export function clearNumberedCreateRecovery(namespace: string, projectId: string, operation: string,
  expectedGeneration: number, reservation: number | undefined): void {
  if (expectedGeneration !== getActiveOrgGeneration() || reservation === undefined) return;
  const key = keyFor(namespace, projectId);
  const current = uncertain.get(key);
  if (current?.operation === operation && current.reservation === reservation) uncertain.delete(key);
}

/** Acknowledged success cannot be resurrected by an older in-flight reply. */
export function completeNumberedCreateRecovery(namespace: string, projectId: string, operation: string, expectedGeneration: number): void {
  if (expectedGeneration !== getActiveOrgGeneration()) return;
  const key = keyFor(namespace, projectId);
  const operations = completed.get(key) ?? new Set<string>();
  operations.add(operation);
  completed.set(key, operations);
  if (uncertain.get(key)?.operation === operation) uncertain.delete(key);
}
