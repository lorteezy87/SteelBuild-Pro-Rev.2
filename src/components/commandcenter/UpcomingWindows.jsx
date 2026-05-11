import React, { useMemo, useEffect, useState } from "react";
import ActionFeed from "./ActionFeed";
import { daysUntil, todayLocalISO } from "@/lib/dateMath";

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
 *
 * Pay-app items (itemType === "PAY") are filtered out — they're tracked
 * on their own SOV / Pay App schedule and the user doesn't want them
 * mixed into the field-side deadlines panel.
 *
 * Date-rollover safety: the bucket math is anchored to "today" via
 * daysUntil(). If the user leaves Command Center open overnight, the
 * `feed` prop's identity may not change, so we'd memoize against a
 * stale "today". A 60-second tick (`midnightTick`) re-runs the
 * bucket pass with today's ISO included in the dep list — so when
 * the local date flips, the windows refresh on the next tick.
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
  // 60-second tick that forces the bucket-by-day useMemo to re-run.
  // Starts at the current local-date string, updates whenever the
  // local date changes. Avoids a setInterval just to bump state once
  // per minute when the underlying date is stable.
  const [todayIso, setTodayIso] = useState(() => todayLocalISO());
  useEffect(() => {
    const id = setInterval(() => {
      const next = todayLocalISO();
      setTodayIso((cur) => (cur === next ? cur : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const { next48, next10 } = useMemo(() => {
    // todayIso is referenced to ensure re-calculation on date rollover
    void todayIso;
    const a = [];
    const b = [];
    for (const item of feed) {
      // Pay-app deadlines live in their own surface (SOV / Pay App
      // submissions). Excluding them here keeps the Command Center
      // "Next 48 / Next 10" panels focused on field-side work.
      if (item?.itemType === "PAY") continue;
      const d = dueDaysFor(item);
      if (d === null) continue;
      if (d >= 0 && d <= 2) a.push({ item, d });
      else if (d >= 3 && d <= 10) b.push({ item, d });
    }
    // Sort by due date ascending within each bucket.
    a.sort((x, y) => x.d - y.d);
    b.sort((x, y) => x.d - y.d);
    return { next48: a.map((x) => x.item), next10: b.map((x) => x.item) };
    // todayIso is read transitively via daysUntil(); list it as a
    // dep so re-bucket fires when the local date rolls over.
  }, [feed, todayIso]);

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
      className="sbd-card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        padding: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
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
          className="sbd-badge sbd-num"
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
            compact
          />
        )}
      </div>
    </div>
  );
}
