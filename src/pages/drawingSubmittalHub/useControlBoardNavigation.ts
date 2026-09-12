import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createSubmittalHref, hubHrefForTriageItem } from "./hubLinks";
import type { HubTabKey } from "./hubLinks";
import type { TriageItem } from "./types";

interface ControlBoardNavigationOptions {
  onOpenTab: (tab: HubTabKey) => void;
  onOpenHref?: (href: string) => void;
}

export function useControlBoardNavigation({
  onOpenTab,
  onOpenHref,
}: ControlBoardNavigationOptions): {
  openItem: (item: TriageItem) => void;
  createSubmittal: (setId: string) => void;
} {
  const navigate = useNavigate();

  const openItem = useCallback((item: TriageItem) => {
    if (onOpenHref) onOpenHref(hubHrefForTriageItem(item));
    else onOpenTab(item.routeTab);
  }, [onOpenHref, onOpenTab]);

  const createSubmittal = useCallback((setId: string) => {
    if (onOpenHref) onOpenHref(createSubmittalHref(setId));
    else navigate(`/Submittals?targetSetId=${encodeURIComponent(setId)}`);
  }, [navigate, onOpenHref]);

  return { openItem, createSubmittal };
}
