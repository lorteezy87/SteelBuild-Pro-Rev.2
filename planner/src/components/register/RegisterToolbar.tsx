import type { ChangeEvent } from "react";
import type { PlannerActionFilters } from "../../data/plannerTypes";

export type RegisterFilterOption = {
  value: string;
  label: string;
};

type RegisterToolbarProps = {
  filters: PlannerActionFilters;
  selectedCount: number;
  completeSelectedDisabled: boolean;
  completeSelectedDisabledReason?: string;
  newActionDisabled?: boolean;
  newActionDisabledReason?: string;
  exportDisabled?: boolean;
  exportDisabledReason?: string;
  projectOptions: readonly RegisterFilterOption[];
  statusOptions: readonly RegisterFilterOption[];
  workstreamOptions: readonly RegisterFilterOption[];
  onFiltersChange: (filters: PlannerActionFilters) => void;
  onCompleteSelected: () => void;
  onNewAction: () => void;
  onExport: () => void;
};

function selectedCountLabel(selectedCount: number): string {
  return `${selectedCount} selected`;
}

/** Native, compact controls shared by all Planner action-register pages. */
export default function RegisterToolbar({
  filters,
  selectedCount,
  completeSelectedDisabled,
  completeSelectedDisabledReason,
  newActionDisabled = false,
  newActionDisabledReason,
  exportDisabled = false,
  exportDisabledReason,
  projectOptions,
  statusOptions,
  workstreamOptions,
  onFiltersChange,
  onCompleteSelected,
  onNewAction,
  onExport,
}: RegisterToolbarProps) {
  const updateFilter = <Key extends keyof PlannerActionFilters>(key: Key, value: PlannerActionFilters[Key]) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div className="planner-register-toolbar" aria-label="Action register toolbar">
      <div className="planner-register-toolbar__actions">
        <button
          className="planner-button planner-button--primary"
          type="button"
          onClick={onNewAction}
          disabled={newActionDisabled}
          aria-describedby={newActionDisabled && newActionDisabledReason ? "planner-new-action-disabled-reason" : undefined}
        >
          New Task
        </button>
        {newActionDisabledReason && <span className="planner-visually-hidden" id="planner-new-action-disabled-reason">{newActionDisabledReason}</span>}
        <button
          className="planner-button"
          type="button"
          onClick={onCompleteSelected}
          disabled={completeSelectedDisabled}
          aria-describedby={completeSelectedDisabled && completeSelectedDisabledReason ? "planner-complete-selected-disabled-reason" : undefined}
        >
          Complete Selected
        </button>
        {completeSelectedDisabledReason && <span className="planner-visually-hidden" id="planner-complete-selected-disabled-reason">{completeSelectedDisabledReason}</span>}
        <span className="planner-register-toolbar__selection" aria-live="polite">
          {selectedCountLabel(selectedCount)}
        </span>
        <button
          className="planner-button"
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-describedby={exportDisabled && exportDisabledReason ? "planner-export-disabled-reason" : undefined}
        >
          Export
        </button>
        {exportDisabledReason && <span className="planner-visually-hidden" id="planner-export-disabled-reason">{exportDisabledReason}</span>}
      </div>

      <div className="planner-register-toolbar__filters">
        <label>
          <span className="planner-visually-hidden">Project</span>
          <select
            aria-label="Project"
            value={filters.projectId ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => updateFilter("projectId", event.target.value)}
          >
            <option value="">All Projects</option>
            {projectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="planner-visually-hidden">Workstream</span>
          <select
            aria-label="Workstream"
            value={filters.workstream ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => updateFilter("workstream", event.target.value)}
          >
            <option value="">All Workstreams</option>
            {workstreamOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="planner-visually-hidden">Status</span>
          <select
            aria-label="Status"
            value={filters.status ?? ""}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => updateFilter("status", event.target.value)}
          >
            <option value="">All Statuses</option>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="planner-register-toolbar__search">
          <span className="planner-visually-hidden">Search actions</span>
          <input
            type="search"
            aria-label="Search actions"
            placeholder="Search tasks, projects, workstreams..."
            value={filters.search ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateFilter("search", event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
