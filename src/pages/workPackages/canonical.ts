/**
 * canonical.ts — what the piece register and Fab Release say about a work
 * package, folded into shapes the Control Center analytics can read.
 *
 * The package row carries three hand-editable fields (`phase`, `status`,
 * `percent_complete`) that the piece rollup owns on piece-driven projects
 * (`refresh_work_package_progress`). Nothing derived `phase` before this
 * module, so a package could sit in "Erection" with 0 of 183 pieces
 * fabricated. These helpers are pure: no React, no network.
 */
import { isPieceDrivenWorkPackageProgress } from "@/lib/pieceControl/wpProgressMapping";

export type CanonicalPhase = "Detailing" | "Fabrication" | "Delivery" | "Erection";

export interface CanonicalPieceRow {
  id: string;
  work_package_id?: string | null;
  parent_piece_id?: string | null;
  is_container?: boolean | null;
  lifecycle_status?: string | null;
  on_hold?: boolean | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface PieceCounts {
  /** Actionable leaf lots (not containers, not split parents). */
  leafCount: number;
  onHold: number;
  notStarted: number;
  released: number;
  inFabrication: number;
  fabricated: number;
  shipped: number;
  delivered: number;
  erected: number;
}

const emptyCounts = (): PieceCounts => ({
  leafCount: 0, onHold: 0, notStarted: 0, released: 0, inFabrication: 0,
  fabricated: 0, shipped: 0, delivered: 0, erected: 0,
});

/**
 * Leaf-lot counts per work package, same leaf rule as the SQL rollup: live,
 * not a container, and no live child lot points at it.
 */
export function summarizePiecesByWorkPackage(pieces: CanonicalPieceRow[] | null | undefined): Map<string, PieceCounts> {
  const out = new Map<string, PieceCounts>();
  const live = (pieces ?? []).filter((p) => p && !p.is_deleted && !p.deleted_at);
  const parents = new Set<string>();
  for (const p of live) if (p.parent_piece_id) parents.add(String(p.parent_piece_id));
  for (const p of live) {
    if (!p.work_package_id) continue;
    if (p.is_container || parents.has(String(p.id))) continue;
    const key = String(p.work_package_id);
    const c = out.get(key) ?? emptyCounts();
    c.leafCount += 1;
    if (p.on_hold) c.onHold += 1;
    switch (String(p.lifecycle_status ?? "not_started")) {
      case "released": c.released += 1; break;
      case "in_fabrication": c.inFabrication += 1; break;
      case "fabricated": c.fabricated += 1; break;
      case "shipped": c.shipped += 1; break;
      case "delivered": c.delivered += 1; break;
      case "erected": c.erected += 1; break;
      default: c.notStarted += 1;
    }
    out.set(key, c);
  }
  return out;
}

/**
 * Phase the pieces put a package in. Mirrors the migration rule so the page
 * and the stored column agree once the rollup writes it:
 *   any delivered/erected → Erection · any shipped → Delivery ·
 *   any released/in fab/fabricated → Fabrication · else Detailing.
 */
export function derivePhaseFromPieces(c: PieceCounts | null | undefined): CanonicalPhase {
  if (!c || c.leafCount === 0) return "Detailing";
  if (c.erected > 0 || c.delivered > 0) return "Erection";
  if (c.shipped > 0) return "Delivery";
  if (c.released > 0 || c.inFabrication > 0 || c.fabricated > 0) return "Fabrication";
  return "Detailing";
}

export interface ReleaseRow {
  id: string;
  work_package_id?: string | null;
  status?: string | null;
  is_exception?: boolean | null;
  weight_tons?: number | string | null;
  release_date?: string | null;
  released_at?: string | null;
  release_number?: string | null;
  canonical_release?: boolean | null;
  is_deleted?: boolean | null;
}

export interface ReleaseSummary {
  id: string;
  releaseNumber: string | null;
  /** A live release whose status reads "released" (case-insensitive). */
  released: boolean;
  isException: boolean;
  canonical: boolean;
  weightTons: number | null;
  releaseDate: string | null;
  /** Live releases on the package (a legacy row plus a canonical one, say). */
  count: number;
}

const toNumber = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Latest live release per package. A released row beats an unreleased one;
 * among equals the most recent release date wins.
 */
export function indexReleasesByWorkPackage(releases: ReleaseRow[] | null | undefined): Map<string, ReleaseSummary> {
  const out = new Map<string, ReleaseSummary>();
  for (const r of releases ?? []) {
    if (!r || r.is_deleted || !r.work_package_id) continue;
    const key = String(r.work_package_id);
    const candidate: ReleaseSummary = {
      id: String(r.id),
      releaseNumber: r.release_number ?? null,
      released: String(r.status ?? "").trim().toLowerCase() === "released",
      isException: Boolean(r.is_exception),
      canonical: Boolean(r.canonical_release),
      weightTons: toNumber(r.weight_tons),
      releaseDate: r.release_date ?? (r.released_at ? String(r.released_at).slice(0, 10) : null),
      count: 1,
    };
    const prev = out.get(key);
    if (!prev) { out.set(key, candidate); continue; }
    const better =
      (candidate.released && !prev.released) ||
      (candidate.released === prev.released && String(candidate.releaseDate ?? "") > String(prev.releaseDate ?? ""));
    const chosen = better ? candidate : prev;
    out.set(key, { ...chosen, count: prev.count + 1 });
  }
  return out;
}

/** True when the piece rollup owns status / percent / phase for this package. */
export function isPieceDrivenPackage(pieceControlMode: string | null | undefined, counts: PieceCounts | null | undefined): boolean {
  return isPieceDrivenWorkPackageProgress(pieceControlMode, counts?.leafCount ?? 0);
}

/** "12 of 40 fabricated · 3 shipped" style caption for cards and the drawer. */
export function describePieceCounts(c: PieceCounts | null | undefined): string {
  if (!c || c.leafCount === 0) return "No pieces assigned";
  const parts: string[] = [];
  const fabbed = c.fabricated + c.shipped + c.delivered + c.erected;
  parts.push(`${fabbed.toLocaleString()} of ${c.leafCount.toLocaleString()} fabricated`);
  if (c.inFabrication) parts.push(`${c.inFabrication.toLocaleString()} in fab`);
  if (c.shipped + c.delivered + c.erected) parts.push(`${(c.shipped + c.delivered + c.erected).toLocaleString()} shipped`);
  if (c.erected) parts.push(`${c.erected.toLocaleString()} erected`);
  if (c.onHold) parts.push(`${c.onHold.toLocaleString()} on hold`);
  return parts.join(" · ");
}
