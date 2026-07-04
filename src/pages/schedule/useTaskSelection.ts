// State-consolidation hook for the Schedule page's bulk-selection state:
// the selectedIds Set plus its toggle. Extracted verbatim from Schedule.tsx —
// setSelectedIds stays exposed so the existing inline `setSelectedIds(new Set())`
// clears and the functional-update calls (e.g. in deleteTaskMut) work unchanged.
import { useState } from "react";

export interface TaskSelection {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelect: (id: string) => void;
}

export function useTaskSelection(): TaskSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return { selectedIds, setSelectedIds, toggleSelect };
}
