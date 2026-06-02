import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeLLM = vi.fn();
vi.mock("@/api/supabaseClient", () => ({
  integrations: { Core: { InvokeLLM: (...a) => invokeLLM(...a) } },
}));

import { buildCopilotPrompt, offlineDraft, draftRfiResponse } from "../rfiCopilot";

const rfi = {
  id: "r1", project_id: "p1", rfi_number: "RFI-014",
  subject: "Beam elevation at grid B", question: "Confirm top-of-steel elevation at grid B.",
  drawing_reference: "S3.2", spec_section: "05 12 00", priority: "High", ball_in_court: "EOR",
};

describe("buildCopilotPrompt", () => {
  it("includes the question and the cited drawing + spec context", () => {
    const p = buildCopilotPrompt(rfi);
    expect(p).toContain("Confirm top-of-steel elevation at grid B.");
    expect(p).toContain("S3.2");
    expect(p).toContain("05 12 00");
    expect(p).toContain("RFI-014");
  });
});

describe("offlineDraft", () => {
  it("references the drawing and always includes a Needs confirmation line; never fabricates", () => {
    const d = offlineDraft(rfi);
    expect(d).toContain("S3.2");
    expect(d).toMatch(/Needs confirmation/i);
    expect(d).toMatch(/AI gateway unavailable/i);
  });
});

describe("draftRfiResponse", () => {
  beforeEach(() => invokeLLM.mockReset());

  it("returns the AI text when the gateway succeeds", async () => {
    invokeLLM.mockResolvedValue({ text: "Top of steel at grid B is per S3.2." });
    const r = await draftRfiResponse({ rfi });
    expect(r.source).toBe("ai");
    expect(r.text).toContain("S3.2");
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ useCase: "rfi-copilot", project_id: "p1" }));
  });

  it("falls back to the offline draft when the gateway errors", async () => {
    invokeLLM.mockResolvedValue({ error: "gateway down" });
    const r = await draftRfiResponse({ rfi });
    expect(r.source).toBe("offline");
    expect(r.text).toMatch(/Needs confirmation/i);
  });

  it("falls back to offline when the gateway throws or returns empty", async () => {
    invokeLLM.mockRejectedValue(new Error("network"));
    expect((await draftRfiResponse({ rfi })).source).toBe("offline");
    invokeLLM.mockResolvedValue({ text: "   " });
    expect((await draftRfiResponse({ rfi })).source).toBe("offline");
  });
});
