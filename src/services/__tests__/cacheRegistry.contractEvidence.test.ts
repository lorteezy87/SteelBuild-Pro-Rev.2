import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateEntity } from "../cacheRegistry";

describe.each(["project", "change_order", "sov_item", "expense"])("%s contract evidence invalidation", entity => {
  it("marks the affected contract snapshot stale without invalidating another project", async () => {
    const client = new QueryClient();
    const affected = ["contract-management", "project-a", "evidence", "org-a"];
    const other = ["contract-management", "project-b", "evidence", "org-b"];
    client.setQueryData(affected, { total: 100 });
    client.setQueryData(other, { total: 200 });

    await invalidateEntity(client, entity, "project-a");

    expect(client.getQueryState(affected)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("invalidates all contract snapshots when the mutation has no project scope", async () => {
    const client = new QueryClient();
    const first = ["contract-management", "project-a", "evidence", "org-a"];
    const second = ["contract-management", "project-b", "evidence", "org-b"];
    client.setQueryData(first, { total: 100 });
    client.setQueryData(second, { total: 200 });

    await invalidateEntity(client, entity);

    expect(client.getQueryState(first)?.isInvalidated).toBe(true);
    expect(client.getQueryState(second)?.isInvalidated).toBe(true);
    client.clear();
  });
});
