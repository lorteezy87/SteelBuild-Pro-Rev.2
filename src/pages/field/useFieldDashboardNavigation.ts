import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { fieldHubHref, pageOfHref } from "./fieldHubLinks";

type Action = (() => void) | null;

/**
 * Field overview navigation. Every target opens as its Field Hub tab, and an
 * action whose module is switched off is null (callers hide it) instead of
 * leading to "module disabled".
 */
export function useFieldDashboardNavigation(todayLogId?: string | null) {
  const navigate = useNavigate();
  const { isPageVisible } = useModuleAccess();

  const canOpenHref = useCallback((href: string) => isPageVisible(pageOfHref(href)), [isPageVisible]);
  const openHref = useCallback(
    (href: string) => {
      if (canOpenHref(href)) navigate(fieldHubHref(href));
    },
    [canOpenHref, navigate],
  );

  return useMemo(() => {
    const go = (href: string): Action => (canOpenHref(href) ? () => navigate(fieldHubHref(href)) : null);
    return {
      openHref,
      canOpenHref,
      openDailyLogSummary: go(todayLogId ? "/DailyLogs" : "/DailyLogs?new=1"),
      openTodayLog: go(todayLogId ? `/DailyLogs?id=${todayLogId}` : "/DailyLogs?new=1"),
      addPhoto: go("/Photos?new=1"),
      openPhotos: go("/Photos"),
      addPunch: go("/Punchlist?new=1"),
      openPunchlist: go("/Punchlist"),
      addSafety: go("/Safety?new=1"),
      openSafety: go("/Safety"),
      openInspections: go("/Inspections"),
      openQualityControl: go("/QualityControl"),
      receiveDelivery: go("/Deliveries?receive=1"),
    };
  }, [canOpenHref, navigate, openHref, todayLogId]);
}
