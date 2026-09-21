import { describe, expect, it } from "vitest";
import { readTablePaged } from "./readTablePaged";

function fixture(table: string, count: number, failSecondPage = false) {
  const calls: Array<{ projectId: string; columns: string[]; from: number; to: number }> = [];
  const rows = Array.from({ length: count }, (_, i) => ({ drawing_id: "same-drawing", user_id: String(i) }));
  const client = {
    from(name: string) {
      expect(name).toBe(table);
      return { select() {
        const call = { projectId: "", columns: [] as string[], from: 0, to: 0 };
        const query = {
          eq(column: string, value: string) { expect(column).toBe("project_id"); call.projectId = value; return query; },
          order(column: string) { call.columns.push(column); return query; },
          async range(from: number, to: number) {
            calls.push({ ...call, from, to });
            if (table === "drawing_watchers" && call.columns.includes("id")) {
              return { data: null, error: { message: "drawing_watchers.id does not exist" } };
            }
            if (failSecondPage && from > 0) return { data: null, error: { message: "page failed" } };
            return { data: rows.slice(from, to + 1), error: null };
          },
        };
        return query;
      } };
    },
  };
  return { client, calls };
}

describe("project export paging", () => {
  it("exports all watchers using both primary-key columns without a nonexistent id", async () => {
    const { client, calls } = fixture("drawing_watchers", 1003);
    const result = await readTablePaged(client, "drawing_watchers", "project-1");
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1003);
    expect(calls).toEqual([
      { projectId: "project-1", columns: ["drawing_id", "user_id"], from: 0, to: 999 },
      { projectId: "project-1", columns: ["drawing_id", "user_id"], from: 1000, to: 1999 },
    ]);
  });
  it("retains id ordering for ordinary tables", async () => {
    const { client, calls } = fixture("drawings", 3);
    expect((await readTablePaged(client, "drawings", "project-1")).rows).toHaveLength(3);
    expect(calls[0].columns).toEqual(["id"]);
  });
  it("uses the project key for project calendars, which also have no id", async () => {
    const { client, calls } = fixture("project_calendars", 1);
    expect((await readTablePaged(client, "project_calendars", "project-1")).error).toBeNull();
    expect(calls[0].columns).toEqual(["project_id"]);
  });
  it("reports a later-page error so the endpoint cannot return a partial backup", async () => {
    const { client } = fixture("drawing_watchers", 1003, true);
    expect((await readTablePaged(client, "drawing_watchers", "project-1")).error).toBe("page failed");
  });
});
