import { getActiveOrgGeneration } from './activeOrg';

/** A native operation cannot be withdrawn after the OS opens its share sheet. */
export function captureExportOwner(extraCheck?: () => boolean): () => boolean {
  const generation = getActiveOrgGeneration();
  return () => generation === getActiveOrgGeneration() && (extraCheck?.() ?? true);
}
