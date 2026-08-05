/**
 * View-state hooks for the RFIs page — bulk selection + the two localStorage-
 * backed display preferences (row density, insights-strip collapsed). Extracted
 * from RFIs.jsx so the page shell stays focused on data + orchestration. The
 * localStorage read/write helpers (loadDensity/loadInsightsCollapsed + the
 * density / insights localStorage-key constants) are the same ones the page used inline.
 */
import { useState } from "react";
import { loadDensity, loadInsightsCollapsed } from "./utils";
import { DENSITY_LS_KEY, DENSITY_PRESETS, INSIGHTS_LS_KEY } from "./constants";

/** Bulk-selection state (a Set of selected RFI ids) + toggles. `filtered` is the
 *  current filtered/sorted RFI list, used by "select all". */
export function useRfiSelection(filtered) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((r) => r.id)) : new Set());
  return { selectedIds, setSelectedIds, toggleSelect, toggleAll };
}

/** Row-density preference (localStorage-backed). Returns the key, the resolved
 *  preset object, and a setter that persists the choice. */
export function useRfiDensity() {
  const [density, setDensity] = useState(loadDensity);
  const handleDensityChange = (v) => {
    setDensity(v);
    try { localStorage.setItem(DENSITY_LS_KEY, v); } catch { /* noop */ }
  };
  const densityPreset = DENSITY_PRESETS[density] || DENSITY_PRESETS.normal;
  return { density, densityPreset, setDensity: handleDensityChange };
}

/** Insights-strip collapsed preference (localStorage-backed). */
export function useRfiInsightsCollapsed() {
  const [insightsCollapsed, setInsightsCollapsed] = useState(loadInsightsCollapsed);
  const toggleInsights = () => {
    setInsightsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(INSIGHTS_LS_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };
  return { insightsCollapsed, toggleInsights };
}
