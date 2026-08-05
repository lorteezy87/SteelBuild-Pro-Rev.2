import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAIN_TEMPLATES,
  normalizeChain,
  getChainTemplates,
  chainState,
  firstExternalStepIndex,
  buildApplyChainPatch,
  buildClearChainPatch,
} from "../approvalChains";

describe("normalizeChain", () => {
  it("accepts arrays of strings", () => {
    expect(normalizeChain(["Detailer", "EOR"])).toEqual([
      { party: "Detailer" },
      { party: "EOR" },
    ]);
  });

  it("accepts arrays of step objects and trims parties", () => {
    expect(normalizeChain([{ party: " GC " }, { party: "EOR" }])).toEqual([
      { party: "GC" },
      { party: "EOR" },
    ]);
  });

  it("drops unusable entries and returns null when nothing survives", () => {
    expect(normalizeChain([{ party: "" }, null, 42])).toBeNull();
    expect(normalizeChain("Detailer")).toBeNull();
    expect(normalizeChain(null)).toBeNull();
    expect(normalizeChain([])).toBeNull();
  });
});

describe("getChainTemplates", () => {
  it("returns the built-ins when the project has no custom templates", () => {
    expect(getChainTemplates(null)).toEqual(DEFAULT_CHAIN_TEMPLATES);
    expect(getChainTemplates({ metadata: {} })).toEqual(DEFAULT_CHAIN_TEMPLATES);
  });

  it("prepends valid project templates and drops broken ones", () => {
    const project = {
      metadata: {
        approval_chain_templates: [
          { key: "owner-route", name: "Owner direct", steps: ["Detailer", "Owner"] },
          { name: "broken", steps: [] },
        ],
      },
    };
    const templates = getChainTemplates(project);
    expect(templates[0]).toMatchObject({ key: "owner-route", custom: true });
    expect(templates[0].steps).toEqual(["Detailer", "Owner"]);
    expect(templates).toHaveLength(DEFAULT_CHAIN_TEMPLATES.length + 1);
  });

  it("lets a project template shadow a built-in with the same key", () => {
    const project = {
      metadata: {
        approval_chain_templates: [
          { key: "standard", name: "Our standard", steps: ["Detailer", "EOR"] },
        ],
      },
    };
    const templates = getChainTemplates(project);
    expect(templates.filter((t) => t.key === "standard")).toHaveLength(1);
    expect(templates.find((t) => t.key === "standard").custom).toBe(true);
  });
});

describe("chainState", () => {
  const submittal = {
    approval_chain: [{ party: "Detailer" }, { party: "GC" }, { party: "EOR" }],
    approval_chain_step: 1,
  };

  it("derives current/next parties from the step index", () => {
    const state = chainState(submittal);
    expect(state.currentParty).toBe("GC");
    expect(state.nextParty).toBe("EOR");
    expect(state.atFinalStep).toBe(false);
  });

  it("flags the final step and clamps an out-of-range index", () => {
    expect(chainState({ ...submittal, approval_chain_step: 2 }).atFinalStep).toBe(true);
    const clamped = chainState({ ...submittal, approval_chain_step: 99 });
    expect(clamped.stepIndex).toBe(2);
    expect(clamped.atFinalStep).toBe(true);
  });

  it("returns inert state when there is no usable chain or step", () => {
    expect(chainState(null).steps).toBeNull();
    expect(chainState({ approval_chain: [] }).steps).toBeNull();
    const noStep = chainState({ ...submittal, approval_chain_step: null });
    expect(noStep.stepIndex).toBeNull();
    expect(noStep.currentParty).toBeNull();
  });
});

describe("firstExternalStepIndex", () => {
  it("finds the first non-detailing party", () => {
    const steps = normalizeChain(["Detailer", "S&H", "GC", "EOR"]);
    expect(firstExternalStepIndex(steps)).toBe(2);
  });

  it("falls back to the second step when every party is internal", () => {
    expect(firstExternalStepIndex(normalizeChain(["Detailer", "S&H"]))).toBe(1);
    expect(firstExternalStepIndex(normalizeChain(["Detailer"]))).toBe(0);
  });
});

describe("buildApplyChainPatch", () => {
  it("starts at step 0 and assigns the ball when the submittal has none", () => {
    const patch = buildApplyChainPatch(["Detailer", "EOR"], { ball_in_court: null });
    expect(patch.approval_chain).toEqual([{ party: "Detailer" }, { party: "EOR" }]);
    expect(patch.approval_chain_step).toBe(0);
    expect(patch.ball_in_court).toBe("Detailer");
  });

  it("aligns the step to the party already holding the ball", () => {
    const patch = buildApplyChainPatch(
      ["Detailer", "GC", "EOR"],
      { ball_in_court: "GC", status: "Submitted" },
    );
    expect(patch.approval_chain_step).toBe(1);
    // BIC already set — never overwritten.
    expect(patch.ball_in_court).toBeUndefined();
  });

  it("returns null for an unusable template", () => {
    expect(buildApplyChainPatch([], {})).toBeNull();
  });
});

describe("buildClearChainPatch", () => {
  it("nulls both routing columns", () => {
    expect(buildClearChainPatch()).toEqual({
      approval_chain: null,
      approval_chain_step: null,
    });
  });
});
