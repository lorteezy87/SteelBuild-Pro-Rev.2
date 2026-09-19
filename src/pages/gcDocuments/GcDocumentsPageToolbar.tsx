/**
 * CommandBar + KPI tiles for the GC Documents register.
 *
 * The KPI row doubles as the impact filter. "Needs review" is first and
 * accented on purpose: it is the number a PM acts on, and an un-reviewed ASI
 * is the one that turns into a change order nobody priced.
 */

import { CommandBar, KpiTile, Button } from "./dsPrimitives";
import { ALL, NEEDS_REVIEW } from "./gcDocumentsPageDerive";
import type { GcDocumentsPageStats } from "./gcDocumentsPageDerive";

export default function GcDocumentsPageToolbar({
  projectName,
  stats,
  impact,
  canCreate,
  onImpactFilter,
  onLogIssuance,
  onExpandAll,
  onCollapseAll,
}: {
  projectName?: string | null;
  stats: GcDocumentsPageStats;
  impact: string;
  canCreate: boolean;
  onImpactFilter: (next: string) => void;
  onLogIssuance: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  // Clicking an active tile clears it, so a tile is a toggle, not a one-way trip.
  const toggle = (value: string) => () =>
    onImpactFilter(impact === value ? ALL : value);

  return (
    <>
      <CommandBar
        eyebrow={`GC DOCUMENTS · ${(projectName || "").toUpperCase()}`}
        title="GC Documents"
        count={stats.total}
        unit={` · ${stats.sheetCount} SHEETS`}
        subtitle="What the GC sent us — GC drawings, ASIs, addenda, bulletins, CCDs, contract documents"
      >
        <Button variant="ghost" onClick={onExpandAll}>EXPAND ALL</Button>
        <Button variant="ghost" onClick={onCollapseAll}>COLLAPSE ALL</Button>
        {canCreate && (
          <Button variant="primary" icon="plus" onClick={onLogIssuance}>
            LOG ISSUANCE
          </Button>
        )}
      </CommandBar>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <KpiTile
          compact
          label="NEEDS REVIEW"
          value={stats.needsReview}
          color="var(--status-review)"
          active={impact === NEEDS_REVIEW}
          onClick={toggle(NEEDS_REVIEW)}
        />
        <KpiTile
          compact
          label="IMPACTS STEEL"
          value={stats.impacted}
          color="var(--status-error)"
          active={impact === "impacted"}
          onClick={toggle("impacted")}
        />
        <KpiTile
          compact
          label="NO IMPACT"
          value={stats.total - stats.needsReview - stats.impacted}
          color="var(--status-success)"
          active={impact === "none"}
          onClick={toggle("none")}
        />
        <KpiTile
          compact
          label="POST-AWARD"
          value={stats.postAward}
          sub="ASI · BULLETIN · CCD"
          color="var(--accent)"
        />
        <KpiTile
          compact
          label="SUPERSEDED"
          value={stats.supersededCount}
          sub="SHEETS"
          color="var(--text-muted)"
        />
      </div>
    </>
  );
}
