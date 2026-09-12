/**
 * useHubView — a hub tab's sub-view, kept in ?hub_view= (hubLinks.HUB_VIEWS).
 *
 * Reading: an unknown or missing value is the tab's default view.
 * Writing: a toggle rewrites the current history entry (replace), so switching
 * views never adds a Back step, and the default view is written as no param.
 * Re-selecting the current view does nothing. Tab switches clear hub_view
 * (nextTabSearch), so a view never follows the user to another tab.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { hubViewSearch, parseHubView } from "./hubLinks";
import type { HubView, HubViewTab } from "./hubLinks";

export function useHubView<T extends HubViewTab>(tab: T): [HubView<T>, (next: HubView<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseHubView(tab, searchParams.get("hub_view"));
  const setView = useCallback(
    (next: HubView<T>) => {
      if (next === view) return;
      setSearchParams((prev) => hubViewSearch(prev, tab, next), { replace: true });
    },
    [setSearchParams, tab, view],
  );
  return [view, setView];
}
