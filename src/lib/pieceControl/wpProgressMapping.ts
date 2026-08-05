/**
 * Maps canonical piece-derived WP status to the persisted work_packages.status enum.
 * Mirror of refresh_work_package_progress SQL mapping (design 2026-07-25).
 */

export type PersistedWorkPackageStatus =
  | "Not Started"
  | "In Progress"
  | "Complete"
  | "On Hold";

export type DerivedWorkPackageLabel =
  | "No Canonical Scope"
  | "Ready for Release"
  | "Released"
  | "In Fabrication"
  | "Fabrication Complete"
  | "Shipping"
  | "Delivered"
  | "Erection"
  | "Complete";

/** Map rich Piece Control label → coarse WP list status. */
export function derivedLabelToPersistedStatus(
  label: DerivedWorkPackageLabel,
  allOnHold = false,
): PersistedWorkPackageStatus {
  if (allOnHold) return "On Hold";
  switch (label) {
    case "Complete":
      return "Complete";
    case "In Fabrication":
    case "Fabrication Complete":
    case "Shipping":
    case "Delivered":
    case "Erection":
      return "In Progress";
    case "No Canonical Scope":
    case "Ready for Release":
    case "Released":
    default:
      return "Not Started";
  }
}

/**
 * Coarse status from leaf lifecycle arrays (same rules as SQL refresh).
 */
export function persistedStatusFromLeafLifecycles(
  lifecycles: string[],
  onHoldFlags: boolean[] = [],
): PersistedWorkPackageStatus {
  if (lifecycles.length === 0) return "Not Started";
  if (
    onHoldFlags.length === lifecycles.length &&
    onHoldFlags.every(Boolean)
  ) {
    return "On Hold";
  }
  if (lifecycles.every((s) => s === "erected")) return "Complete";
  if (
    lifecycles.some((s) =>
      [
        "in_fabrication",
        "fabricated",
        "shipped",
        "delivered",
        "erected",
      ].includes(s),
    )
  ) {
    return "In Progress";
  }
  return "Not Started";
}

/** True when WP form must not manually edit % / status. */
export function isPieceDrivenWorkPackageProgress(
  pieceControlMode: string | null | undefined,
  assignedLeafCount: number,
): boolean {
  const mode = String(pieceControlMode ?? "off");
  return (mode === "pilot" || mode === "live") && assignedLeafCount > 0;
}
