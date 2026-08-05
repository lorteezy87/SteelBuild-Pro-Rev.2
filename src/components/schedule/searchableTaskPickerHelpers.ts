export type PickerTaskLike = {
  task_name?: string | null;
  wbs_code?: string | null;
  phase?: string | null;
  [key: string]: unknown;
};

export function filterSearchableTasks<T extends PickerTaskLike>(
  tasks: T[] | null | undefined,
  query: string,
  limit = 50,
): T[] {
  const list = tasks || [];
  if (!query.trim()) return list.slice(0, limit);
  const q = query.toLowerCase();
  return list
    .filter((t) => {
      const name = (t.task_name || "").toLowerCase();
      const wbs = (t.wbs_code || "").toLowerCase();
      const phase = (t.phase || "").toLowerCase();
      return name.includes(q) || wbs.includes(q) || phase.includes(q);
    })
    .slice(0, limit);
}
