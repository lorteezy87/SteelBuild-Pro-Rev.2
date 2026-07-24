// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emitProjectUpdated, subscribeProjectUpdated } from "../projectUpdateEvents";

describe("project update events", () => {
  it("delivers the saved project to active project subscribers", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeProjectUpdated(handler);
    const project = { id: "p-1", original_contract_value: 125000, contract_type: "GMP" };

    emitProjectUpdated(project);

    expect(handler).toHaveBeenCalledWith(project);
    unsubscribe();
  });

  it("does not emit incomplete records", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeProjectUpdated(handler);
    emitProjectUpdated({ original_contract_value: 125000 });
    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});
