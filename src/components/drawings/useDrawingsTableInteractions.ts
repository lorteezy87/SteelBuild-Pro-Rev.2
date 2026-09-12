import { useCallback, useEffect, useRef, useState } from "react";
import { COMPACT_WIDTH_PX } from "./drawingsConfig";
import {
  findBrandNewGroupKeys,
  loadExpandedSets,
  nextSortState,
  saveExpandedSets,
  type DrawingGroup,
  type DrawingTableSort,
  type DrawingTableSortField,
} from "./drawingsTableDerive";

export function useDrawingsTableInteractions(groups: DrawingGroup[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [sort, setSort] = useState<DrawingTableSort>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => loadExpandedSets() ?? new Set<string>(),
  );
  const seenKeysRef = useRef<Set<string> | null>(null);

  if (seenKeysRef.current === null) {
    seenKeysRef.current = new Set(groups.map((group) => group.key));
  }

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width ?? element.clientWidth;
        setCompact(width < COMPACT_WIDTH_PX);
      }
    });
    observer.observe(element);
    setCompact(element.clientWidth < COMPACT_WIDTH_PX);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const seen = seenKeysRef.current;
    if (!seen) return;
    const brandNew = findBrandNewGroupKeys(groups, seen);
    if (brandNew.length === 0) return;
    setExpanded((previous) => {
      const next = new Set(previous);
      brandNew.forEach((group) => next.add(group.key));
      saveExpandedSets(next);
      return next;
    });
    brandNew.forEach((group) => seen.add(group.key));
  }, [groups]);

  const handleSort = useCallback((field: DrawingTableSortField) => {
    setSort((previous) => nextSortState(previous, field));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      saveExpandedSets(next);
      return next;
    });
  }, []);

  return {
    containerRef,
    compact,
    sort,
    expanded,
    handleSort,
    toggleExpand,
  };
}
