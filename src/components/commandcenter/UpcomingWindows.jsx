import React, { useMemo } from "react";
import ActionFeed from "./ActionFeed";
import { daysUntil } from "@/lib/dateMath";

/**
 * UpcomingWindows — two side-by-side panels surfacing feed items by horizon:
 *   - Next 48 hours (today through 2 days out)
 *   - Next 10 days  (3 through 10 days out)
 *
 * Bucketing key per item: earliest of raw.date_required / raw.scheduled_date
 * / raw.due_date / raw.period_to. Items without a parseable due/occur date
 * are excluded (they're not scheduled in a specific window).
 *
 * The two windows are disjoint by design so the same item doesn't appear in
 * both panels — 48h shows what's imminent, 10-day shows the near-term queue
 * behind it.
 */

function dueDaysFor(item) {
  const raw = item.raw || {};
  const due =
    raw.date_required ||
    raw.scheduled_date ||
    raw.due_date ||
    raw.period_to ||
    null;
  const n = daysUntil(due);
  return Number.isFinite(n) ? n : null;
}

export default function UpcomingWindows({ feed = [], onOpenDetail }) {
  const { next48, next10 } = useMemo(() => {
    const a = [];
    const b = [];
    for (const item of feed) {
      const d = dueDaysFor(item);
      if (d === null) continue;
      if (d >= 0 && d <= 2) a.push({ item, d });
      else if (d >= 3 && d <= 10) b.push({ item, d });
    }
    // Sort by due date ascending within each bucket.
    a.sort((x, y) => x.d - y.d);
    b.sort((x, y) => x.d - y.d);
    return { next48: a.map((x) => x.item), next10: b.map((x) => x.item) };
  }, [feed]);

  return (
    <div className="cc-upcoming-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
      <Panel
        title="Next 48 Hours"
        subtitle="Today through 2 days out"
        accent="var(--status-warning)"
        count={next48.length}
        items={next48}
        onOpenDetail={onOpenDetail}
      />
      <Panel
        title="Next 10 Days"
        subtitle="3 – 10 days out"
        accent="var(--accent)"
        count={next10.length}
        items={next10}
        onOpenDetail={onOpenDetail}
      />
      <style>{`
        @media (max-width: 980px) {
          .cc-upcoming-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Panel({ title, subtitle, accent, count, items, onOpenDetail }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-sidebar)",
          borderLeft: `3px solid ${accent}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 3,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
            letterSpacing: "0.08em",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ padding: items.length === 0 ? 0 : 10 }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Nothing scheduled in this window.
          </div>
        ) : (
          <ActionFeed
            items={items}
            selectedIndex={-1}
            onSelectIndex={() => {}}
            onOpenDetail={onOpenDetail}
          />
        )}
      </div>
    </div>
  );
}
