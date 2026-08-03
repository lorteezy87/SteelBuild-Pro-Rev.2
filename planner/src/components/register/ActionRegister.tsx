import type { PlannerAction, PlannerActionFilters } from "../../data/plannerTypes";
import RegisterToolbar, { type RegisterFilterOption } from "./RegisterToolbar";
import {
  ACTION_REGISTER_COLUMNS,
  getActionRegisterValue,
  getPlannerActionRowTone,
  isTerminalActionStatus,
} from "./registerColumns";

type ActionRegisterProps = {
  actions: readonly PlannerAction[];
  filters: PlannerActionFilters;
  selectedActionIds: readonly string[];
  onSelectedActionIdsChange: (ids: string[]) => void;
  onFiltersChange: (filters: PlannerActionFilters) => void;
  onCompleteSelected: (ids: readonly string[]) => void;
  onNewAction: () => void;
  onExport: () => void;
  completeSelectedDisabled?: boolean;
  completeSelectedDisabledReason?: string;
  newActionDisabled?: boolean;
  newActionDisabledReason?: string;
  exportDisabled?: boolean;
  exportDisabledReason?: string;
};

function uniqueFilterOptions(
  actions: readonly PlannerAction[],
  valueFor: (action: PlannerAction) => string | null | undefined,
  labelFor: (action: PlannerAction) => string | null | undefined,
): RegisterFilterOption[] {
  const optionByValue = new Map<string, RegisterFilterOption>();
  for (const action of actions) {
    const value = valueFor(action)?.trim();
    if (!value || optionByValue.has(value)) continue;
    optionByValue.set(value, { value, label: labelFor(action)?.trim() || value });
  }
  return [...optionByValue.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function rowSelectionLabel(action: PlannerAction): string {
  return `Select ${action.title?.trim() || "untitled action"}`;
}

function priorityClass(priority: string | null): string {
  return priority ? `planner-register__priority--${priority.toLocaleLowerCase()}` : "";
}

/** Semantic, horizontally scrollable action register. Data mutation remains owned by its caller. */
export default function ActionRegister({
  actions,
  filters,
  selectedActionIds,
  onSelectedActionIdsChange,
  onFiltersChange,
  onCompleteSelected,
  onNewAction,
  onExport,
  completeSelectedDisabled: forceCompleteSelectedDisabled,
  completeSelectedDisabledReason,
  newActionDisabled,
  newActionDisabledReason,
  exportDisabled,
  exportDisabledReason,
}: ActionRegisterProps) {
  const selectedIds = new Set(selectedActionIds);
  const selectedRows = selectedActionIds.map((id) => actions.find((action) => action.id === id));
  const hasIneligibleSelection = selectedRows.some((action) => (
    !action || Boolean(action.archived_at) || isTerminalActionStatus(action.status)
  ));
  const completeSelectedDisabled = forceCompleteSelectedDisabled || selectedActionIds.length === 0 || hasIneligibleSelection;
  const allRowsSelected = actions.length > 0 && actions.every((action) => selectedIds.has(action.id));
  const projectOptions = uniqueFilterOptions(actions, (action) => action.project_id, (action) => action.project_name);
  const statusOptions = uniqueFilterOptions(actions, (action) => action.status, (action) => action.status);
  const workstreamOptions = uniqueFilterOptions(actions, (action) => action.workstream, (action) => action.workstream);

  const toggleAction = (actionId: string) => {
    const next = selectedIds.has(actionId)
      ? selectedActionIds.filter((id) => id !== actionId)
      : [...selectedActionIds, actionId];
    onSelectedActionIdsChange(next);
  };

  const toggleAllActions = () => {
    onSelectedActionIdsChange(allRowsSelected ? [] : actions.map((action) => action.id));
  };

  return (
    <section className="planner-register" aria-label="Action register">
      <RegisterToolbar
        filters={filters}
        selectedCount={selectedActionIds.length}
        completeSelectedDisabled={completeSelectedDisabled}
        completeSelectedDisabledReason={completeSelectedDisabled ? completeSelectedDisabledReason ?? "Select active actions before completing them." : undefined}
        newActionDisabled={newActionDisabled}
        newActionDisabledReason={newActionDisabledReason}
        exportDisabled={exportDisabled}
        exportDisabledReason={exportDisabledReason}
        projectOptions={projectOptions}
        statusOptions={statusOptions}
        workstreamOptions={workstreamOptions}
        onFiltersChange={onFiltersChange}
        onCompleteSelected={() => onCompleteSelected(selectedActionIds)}
        onNewAction={onNewAction}
        onExport={onExport}
      />

      <div className="planner-register__scroll">
        <table>
          <thead>
            <tr>
              <th className="planner-register__selection-cell" data-sticky="true" scope="col">
                <input
                  type="checkbox"
                  aria-label="Select all actions"
                  checked={allRowsSelected}
                  onChange={toggleAllActions}
                />
              </th>
              {ACTION_REGISTER_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  data-sticky="true"
                  scope="col"
                  style={{ minWidth: `${column.minWidth}px` }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              const tone = getPlannerActionRowTone(action);
              return (
                <tr className={`planner-register__row planner-register__row--${tone}`} key={action.id}>
                  <td className="planner-register__selection-cell">
                    <input
                      type="checkbox"
                      aria-label={rowSelectionLabel(action)}
                      checked={selectedIds.has(action.id)}
                      onChange={() => toggleAction(action.id)}
                    />
                  </td>
                  {ACTION_REGISTER_COLUMNS.map((column) => {
                    const value = getActionRegisterValue(action, column.key);
                    const isPriority = column.key === "priority";
                    return (
                      <td key={column.key} className={`planner-register__cell planner-register__cell--${column.key}`}>
                        {isPriority ? <span className={`planner-register__priority ${priorityClass(action.priority)}`}>{value}</span> : value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {actions.length === 0 && (
              <tr>
                <td className="planner-register__empty" colSpan={ACTION_REGISTER_COLUMNS.length + 1}>
                  No actions match the current Planner register filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
