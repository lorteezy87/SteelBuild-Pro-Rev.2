import { functions } from "@/api/client/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabase";

describe("functions.invoke", () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it("rejects unsupported backend functions instead of returning a null result", async () => {
    await expect(functions.invoke("not-a-supported-function")).rejects.toThrow(
      "Unsupported backend function: not-a-supported-function",
    );
  });

  it("fails closed for generateAlerts instead of returning empty success", async () => {
    await expect(functions.invoke("generateAlerts")).rejects.toThrow(/generate-alerts/i);
  });

  it("fails closed for retired agentMemory instead of returning null data", async () => {
    await expect(functions.invoke("agentMemory")).rejects.toThrow(/retired/i);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("returns an error-shaped LLM payload when llm-proxy is unavailable", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error("Failed to send a request to the Edge Function"));

    await expect(functions.invoke("invokeLLM", { prompt: "hi" })).resolves.toEqual({
      data: {
        text: null,
        error: "Failed to send a request to the Edge Function",
      },
    });
  });
});
