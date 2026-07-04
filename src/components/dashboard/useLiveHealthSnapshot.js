import { useState, useEffect } from "react";

/**
 * useLiveHealthSnapshot — owns the portfolio KPI sparkline history.
 *
 * Extracted verbatim from PortfolioView: it (1) hydrates the 7-day KPI
 * snapshot map from localStorage on mount, (2) persists a fresh snapshot once
 * per day (keyed by ISO date, trimmed to the last 7 days), and (3) exposes
 * `sparkFor(field)` which returns the chronological series for a KPI field
 * (empty until at least 2 days of history exist).
 *
 * Accepts the `portfolioKPIs` roll-up it previously closed over. The
 * localStorage key ("sbp-portfolio-spark"), the once-per-day guard (ISO-date
 * key dedup), and the last-7-days trim are preserved exactly.
 */
export function useLiveHealthSnapshot(portfolioKPIs) {
  // ── Sparkline history: store 7-day KPI snapshots in localStorage ──────────
  const [sparkHistory, setSparkHistory] = useState({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sbp-portfolio-spark");
      if (raw) setSparkHistory(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  // ── Persist sparkline snapshot once per day ────────────────────────────────
  useEffect(() => {
    if (!portfolioKPIs) return;
    try {
      const dateKey = new Date().toISOString().slice(0, 10);
      const hist = { ...sparkHistory };
      hist[dateKey] = {
        overdueRFIs: portfolioKPIs.overdueRFIs,
        openRFIs: portfolioKPIs.openRFIs,
        pendingCOs: portfolioKPIs.pendingCOs,
        lateDeliveries: portfolioKPIs.lateDeliveries,
        atRisk: portfolioKPIs.atRisk,
      };
      // keep last 7 days only
      const keys = Object.keys(hist).sort().slice(-7);
      const trimmed = {};
      keys.forEach((k) => (trimmed[k] = hist[k]));
      localStorage.setItem("sbp-portfolio-spark", JSON.stringify(trimmed));
      setSparkHistory(trimmed);
    } catch { /* noop */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioKPIs]);

  const sparkFor = (field) => {
    const days = Object.keys(sparkHistory).sort();
    if (days.length < 2) return [];
    return days.map((d) => sparkHistory[d]?.[field] ?? 0);
  };

  return { sparkFor };
}
