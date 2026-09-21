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
export interface ExportClient {
  from(table: string): { select(columns: string): ExportQuery };
}

export async function readQueryPages(readPage: (from: number, to: number) => PromiseLike<ExportPage>): Promise<{ rows: ExportRow[]; error: string | null }> {
  const rows: ExportRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { rows, error: null };
  }
}

/** Stable paging under the caller's RLS session, including composite-key tables. */
export async function readTablePaged(
  client: ExportClient,
  table: string,
  projectId: string,
): Promise<{ rows: ExportRow[]; error: string | null }> {
  // drawing_watchers has no id: its PRIMARY KEY is (drawing_id, user_id).
  const orderColumns = table === "drawing_watchers"
    ? ["drawing_id", "user_id"]
    : table === "project_calendars" ? ["project_id"] : ["id"];
  return readQueryPages((from, to) => {
    let query = client.from(table).select("*").eq("project_id", projectId);
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    return query.range(from, to);
  });
}
