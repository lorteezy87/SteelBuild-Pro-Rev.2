import { downloadTextFile } from "@/lib/exports/fabRelease";
import {
  buildBackchargeRegisterCsv,
  buildDefenseManifestCsv,
} from "@/lib/backcharge/defensePackage";
/**
 * Pure helpers for Backcharges page shell.
 */
/** @deprecated Prefer `@/pages/shared/buildIdMap`. */
export { buildIdMap } from "@/pages/shared/buildIdMap";

/** @deprecated Prefer `@/pages/shared/formatUsd`. */
export { formatUsd } from "@/pages/shared/formatUsd";

/** Side-effect register CSV download. */
export function downloadBackchargeRegisterCsv(
  backcharges: Parameters<typeof buildBackchargeRegisterCsv>[0],
  filename = "backcharge_register.csv",
): void {
  downloadTextFile(buildBackchargeRegisterCsv(backcharges), filename, "text/csv;charset=utf-8");
}

/** Side-effect defense manifest CSV download. */
export function downloadDefenseManifestCsv(
  bc: Parameters<typeof buildDefenseManifestCsv>[0],
  tickets: Parameters<typeof buildDefenseManifestCsv>[1],
  events: Parameters<typeof buildDefenseManifestCsv>[2],
  filename: string,
): void {
  downloadTextFile(buildDefenseManifestCsv(bc, tickets, events), filename, "text/csv;charset=utf-8");
}

