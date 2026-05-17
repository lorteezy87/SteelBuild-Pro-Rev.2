// ============================================================================
// SteelBuild Pro — Provenance & Confidence Wrapper
// ============================================================================
// Every tool result is wrapped with provenance metadata so Claude can cite
// specific evidence and communicate confidence honestly.
//
// Shape returned to the model:
//   {
//     ok: true,
//     data: <actual result>,
//     provenance: {
//       as_of: "2026-04-21T14:32:00Z",
//       confidence: "HIGH" | "MEDIUM" | "LOW",
//       evidence: [ "6 late submittals", "2 pending RFIs", ... ],
//       staleness_warnings: [...],
//       data_gaps: [...],
//       source_tables: [...],
//       row_counts: { ... }
//     }
//   }
// ============================================================================

import type { Confidence } from "./schedule-reasoning.ts";

export interface Provenance {
  as_of: string;
  confidence: Confidence;
  evidence: string[];
  staleness_warnings: string[];
  data_gaps: string[];
  source_tables: string[];
  row_counts: Record<string, number>;
}

export interface WrappedResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------
export class ProvenanceBuilder {
  private evidence: string[] = [];
  private staleness: string[] = [];
  private gaps: string[] = [];
  private tables: Set<string> = new Set();
  private counts: Record<string, number> = {};
  private started_at = new Date().toISOString();

  addEvidence(item: string): this {
    this.evidence.push(item);
    return this;
  }

  addStaleness(warning: string): this {
    this.staleness.push(warning);
    return this;
  }

  addGap(gap: string): this {
    this.gaps.push(gap);
    return this;
  }

  addSource(table: string, rowCount: number): this {
    this.tables.add(table);
    this.counts[table] = rowCount;
    return this;
  }

  build(confidence?: Confidence): Provenance {
    return {
      as_of: this.started_at,
      confidence: confidence ?? this.inferConfidence(),
      evidence: [...this.evidence],
      staleness_warnings: [...this.staleness],
      data_gaps: [...this.gaps],
      source_tables: Array.from(this.tables),
      row_counts: { ...this.counts },
    };
  }

  /**
   * Default confidence inference:
   *  - LOW: any staleness warning OR 2+ data gaps OR zero evidence
   *  - MEDIUM: 1 data gap OR evidence count 1-2
   *  - HIGH: no warnings, no gaps, evidence count >= 3
   */
  private inferConfidence(): Confidence {
    if (this.staleness.length > 0) return "LOW";
    if (this.gaps.length >= 2) return "LOW";
    if (this.evidence.length === 0) return "LOW";
    if (this.gaps.length === 1 || this.evidence.length < 3) return "MEDIUM";
    return "HIGH";
  }
}

// ---------------------------------------------------------------------------
// Success and error factories
// ---------------------------------------------------------------------------
export function success<T>(data: T, provenance: Provenance): WrappedResult<T> {
  return { ok: true, data, provenance };
}

export function failure(
  error: string,
  provenance: Provenance
): WrappedResult<never> {
  return { ok: false, error, provenance };
}

/**
 * Empty-result wrapper. When a query succeeds but returns no rows, that's
 * meaningful information — not an error, but confidence drops to LOW.
 */
export function emptyResult<T>(
  data: T,
  sourceTable: string,
  reason: string
): WrappedResult<T> {
  const pb = new ProvenanceBuilder();
  pb.addSource(sourceTable, 0);
  pb.addGap(reason);
  return success(data, pb.build("LOW"));
}
