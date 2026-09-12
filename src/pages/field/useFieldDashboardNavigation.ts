import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

export function useFieldDashboardNavigation(todayLogId?: string | null) {
  const navigate = useNavigate();
  const openHref = useCallback((href: string) => navigate(href), [navigate]);

  return useMemo(
    () => ({
      openHref,
      openDailyLogSummary: () =>
        navigate(todayLogId ? "/DailyLogs" : "/DailyLogs?new=1"),
      openTodayLog: () =>
        navigate(todayLogId ? `/DailyLogs?id=${todayLogId}` : "/DailyLogs?new=1"),
      addPhoto: () => navigate("/Photos?new=1"),
      openPhotos: () => navigate("/Photos"),
      addPunch: () => navigate("/Punchlist?new=1"),
      openPunchlist: () => navigate("/Punchlist"),
      addSafety: () => navigate("/Safety?new=1"),
      openSafety: () => navigate("/Safety"),
      openInspections: () => navigate("/Inspections"),
      openQualityControl: () => navigate("/QualityControl"),
      receiveDelivery: () => navigate("/Deliveries?receive=1"),
    }),
    [navigate, openHref, todayLogId],
  );
}
