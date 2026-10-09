import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateEntity } from "../cacheRegistry";

describe.each([
  {
    name: "change-order review",
    sources: ["project", "sov_item", "rfi"],
    affected: ["change-orders", "project-a", "org-a", "evidence"],
    other: ["change-orders", "project-b", "org-a", "evidence"],
  },
  {
    name: "SOV financial",
    sources: ["project", "cost_code"],
    affected: ["sov-items", "project-a", "evidence", "org-a"],
    other: ["sov-items", "project-b", "evidence", "org-a"],
  },
  {
    name: "constraint readiness",
    sources: ["project", "action_item", "work_package", "rfi", "submittal", "delivery", "schedule_task", "drawing", "inspection"],
    affected: ["constraints", "project-a", "evidence", "org-a"],
    other: ["constraints", "project-b", "evidence", "org-a"],
  },
])("$name snapshot dependencies", ({ sources, affected, other }) => {
  describe.each(sources)("%s mutation", entity => {
    it("invalidates the dependent snapshot for its project", async () => {
      const client = new QueryClient();
      client.setQueryData(affected, { complete: true });
      client.setQueryData(other, { complete: true });

      await invalidateEntity(client, entity, "project-a");

      expect(client.getQueryState(affected)?.isInvalidated).toBe(true);
      expect(client.getQueryState(other)?.isInvalidated).toBe(false);
      client.clear();
    });

    it("invalidates dependent snapshots across projects when scope is unspecified", async () => {
      const client = new QueryClient();
      client.setQueryData(affected, { complete: true });
      client.setQueryData(other, { complete: true });

      await invalidateEntity(client, entity);

      expect(client.getQueryState(affected)?.isInvalidated).toBe(true);
      expect(client.getQueryState(other)?.isInvalidated).toBe(true);
      client.clear();
    });
  });
});
