// State-consolidation hook for the Schedule page's modal/drawer open flags.
// Each flag keeps the exact same set/get semantics it had inline (a plain
// useState<boolean> initialised to false) — this only groups the declarations
// so the page shell reads less like a wall of useState calls. No behavior
// change: callers use the same setter names (setShowAddTask, etc.).
import { useState } from "react";

export interface ScheduleModals {
  showDrawer: boolean;
  setShowDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  showAddTask: boolean;
  setShowAddTask: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkAdd: boolean;
  setShowBulkAdd: React.Dispatch<React.SetStateAction<boolean>>;
  showWbsBuilder: boolean;
  setShowWbsBuilder: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkResource: boolean;
  setShowBulkResource: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkDates: boolean;
  setShowBulkDates: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkDuration: boolean;
  setShowBulkDuration: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkParent: boolean;
  setShowBulkParent: React.Dispatch<React.SetStateAction<boolean>>;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useScheduleModals(): ScheduleModals {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showWbsBuilder, setShowWbsBuilder] = useState(false);
  const [showBulkResource, setShowBulkResource] = useState(false);
  const [showBulkDates, setShowBulkDates] = useState(false);
  const [showBulkDuration, setShowBulkDuration] = useState(false);
  const [showBulkParent, setShowBulkParent] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  return {
    showDrawer,
    setShowDrawer,
    showAddTask,
    setShowAddTask,
    showBulkAdd,
    setShowBulkAdd,
    showWbsBuilder,
    setShowWbsBuilder,
    showBulkResource,
    setShowBulkResource,
    showBulkDates,
    setShowBulkDates,
    showBulkDuration,
    setShowBulkDuration,
    showBulkParent,
    setShowBulkParent,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
  };
}
