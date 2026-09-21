type ExportRow = Record<string, unknown>;
interface ExportPage {
  data: ExportRow[] | null;
  error: { message: string } | null;
}
interface ExportQuery {
  eq(column: string, value: string): ExportQuery;
  order(column: string, options: { ascending: boolean }): ExportQuery;
  range(from: number, to: number): PromiseLike<ExportPage>;
}
interface ExportClient {
  from(table: string): { select(columns: string): ExportQuery };
}

/** Stable paging under the caller's RLS session, including composite-key tables. */
export async function readTablePaged(
  client: ExportClient,
  table: string,
  projectId: string,
): Promise<{ rows: ExportRow[]; error: string | null }> {
  const rows: ExportRow[] = [];
  // drawing_watchers has no id: its PRIMARY KEY is (drawing_id, user_id).
  const orderColumns = table === "drawing_watchers" ? ["drawing_id", "user_id"] : ["id"];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table).select("*").eq("project_id", projectId);
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { rows, error: null };
  }
}
