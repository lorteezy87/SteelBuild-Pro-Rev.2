import { useCallback, useRef, type RefObject } from "react";
import { Camera, ClipboardCheck, ClipboardList } from "lucide-react";
import { FilterBar } from "@/components/command";

const STATUS_CHIPS = [
  { label: "All", value: "all" },
  { label: "Due Today", value: "due-today" },
  { label: "Active", value: "active" },
] as const;

interface UseFieldTodayNavigationOptions {
  todayIso: string;
  onStatusFilter: (value: string) => void;
}

export interface FieldTodayNavigation {
  tableRef: RefObject<HTMLDivElement>;
  showAllTasks: () => void;
  showTaskTable: () => void;
  showDailyPhotos: () => void;
}

export function useFieldTodayNavigation({
  todayIso,
  onStatusFilter,
}: UseFieldTodayNavigationOptions): FieldTodayNavigation {
  const tableRef = useRef<HTMLDivElement>(null);
  const showTaskTable = useCallback(() => {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const showAllTasks = useCallback(() => {
    onStatusFilter("all");
    showTaskTable();
  }, [onStatusFilter, showTaskTable]);
  const showDailyPhotos = useCallback(() => {
    window.location.assign(`/Photos?date=${todayIso}`);
  }, [todayIso]);

  return { tableRef, showAllTasks, showTaskTable, showDailyPhotos };
}

interface FieldTodayInteractionProps {
  search: string;
  onSearch: (value: string) => void;
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  onAddPunch: () => void;
  onAddPhoto: () => void;
  onDailyLog: () => void;
  uploadingPhoto?: boolean;
}

export function FieldTodayCaptureActions({
  onAddPunch,
  onAddPhoto,
  onDailyLog,
  uploadingPhoto = false,
}: Pick<
  FieldTodayInteractionProps,
  "onAddPunch" | "onAddPhoto" | "onDailyLog" | "uploadingPhoto"
>) {
  return (
    <div style={{ display: "flex", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onAddPunch}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            padding: "8px 14px",
            fontWeight: 700,
            borderColor: "var(--status-warning)",
            color: "var(--status-warning)",
          }}
        >
          <ClipboardCheck size={14} />
          Add Punch
        </button>
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onAddPhoto}
          disabled={uploadingPhoto}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            padding: "8px 14px",
            fontWeight: 700,
            opacity: uploadingPhoto ? 0.6 : 1,
          }}
        >
          <Camera size={14} />
          {uploadingPhoto ? "Uploading…" : "Photo"}
        </button>
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onDailyLog}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            padding: "8px 14px",
            fontWeight: 700,
          }}
        >
          <ClipboardList size={14} />
          Daily Log
        </button>
    </div>
  );
}

export function FieldTodayTaskFilters({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  onDailyLog,
}: Pick<
  FieldTodayInteractionProps,
  "search" | "onSearch" | "statusFilter" | "onStatusFilter" | "onDailyLog"
>) {
  return (
    <FilterBar
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search tasks by name, location, or crew…"
      primaryLabel="Log Activity"
      onPrimary={onDailyLog}
      filters={
        <>
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`cmd-chip-btn${statusFilter === chip.value ? " is-active" : ""}`}
              onClick={() => onStatusFilter(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </>
      }
    />
  );
}
