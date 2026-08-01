export type ColumnPriority = "essential" | "secondary" | "optional";

export type PriorityColumn<T extends string = string> = {
  id: T;
  priority: ColumnPriority;
};

const TABLET_PRIORITIES: ColumnPriority[] = ["essential", "secondary"];
const PHONE_PRIORITIES: ColumnPriority[] = ["essential"];

/** Columns visible at the given viewport band. */
export function visibleColumnIds(
  columns: PriorityColumn[],
  band: "phone" | "tablet" | "desktop",
): string[] {
  if (band === "desktop") {
    return columns.map((col) => col.id);
  }

  const allowed = band === "tablet" ? TABLET_PRIORITIES : PHONE_PRIORITIES;
  return columns.filter((col) => allowed.includes(col.priority)).map((col) => col.id);
}
