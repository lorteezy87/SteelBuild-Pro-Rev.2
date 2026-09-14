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
    vi.mocked(supabase.rpc).mockReset();
  });

  describe("unsupported / retired / fail-closed names", () => {
    it("rejects unknown function names with a stable message", async () => {
      await expect(functions.invoke("not-a-supported-function")).rejects.toThrow(
        "Unsupported backend function: not-a-supported-function",
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects empty string name", async () => {
      await expect(functions.invoke("")).rejects.toThrow(
        /Unsupported backend function/i,
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("fails closed for generateAlerts with the intended message", async () => {
      await expect(functions.invoke("generateAlerts")).rejects.toThrow(
        /generate-alerts Edge Function is not deployed/i,
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("fails closed for retired agentMemory and does not call edge functions or rpc", async () => {
      await expect(functions.invoke("agentMemory")).rejects.toThrow(
        /retired memory Edge Function is not deployed/i,
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("does not treat lookalike names as supported (case/format edge cases)", async () => {
      for (const name of [
        "GenerateAlerts",
        "agent-memory",
        "invoke-llm",
        "INVOKE_LLM",
        "number-sequence",
        "secure-number-sequence",
      ]) {
        await expect(functions.invoke(name)).rejects.toThrow(
          /Unsupported backend function/i,
        );
      }
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("invokeLLM / anthropicProxy", () => {
    it("returns error-shaped payload when the edge function request fails", async () => {
      const networkError = new Error(
        "Failed to send a request to the Edge Function",
      );
      vi.mocked(supabase.functions.invoke).mockRejectedValue(networkError);

      await expect(
        functions.invoke("invokeLLM", { prompt: "hi" }),
      ).resolves.toEqual({
        data: {
          text: null,
          error: "Failed to send a request to the Edge Function",
        },
      });

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "llm-proxy",
        expect.objectContaining({
          body: expect.objectContaining({ prompt: "hi" }),
        }),
      );
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("returns error-shaped payload when invoke resolves with a functions error object", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: "Edge Function returned a non-2xx status code" },
      } as never);

      const result = await functions.invoke("invokeLLM", { prompt: "hi" });
      expect(result).toEqual({
        data: {
          text: null,
          error: "Edge Function returned a non-2xx status code",
        },
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "llm-proxy",
        expect.objectContaining({ body: expect.objectContaining({ prompt: "hi" }) }),
      );
    });

    it("propagates successful LLM text payloads", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { text: "hello world", error: null },
        error: null,
      } as never);

      await expect(
        functions.invoke("invokeLLM", { prompt: "hi" }),
      ).resolves.toEqual({
        data: { text: "hello world", error: null },
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "llm-proxy",
        expect.objectContaining({ body: { prompt: "hi" } }),
      );
    });

    it("accepts anthropicProxy as an alias for the same llm-proxy path", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { text: "alias ok" },
        error: null,
      } as never);

      await expect(
        functions.invoke("anthropicProxy", { prompt: "hi" }),
      ).resolves.toEqual({
        data: { text: "alias ok" },
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "llm-proxy",
        expect.objectContaining({ body: { prompt: "hi" } }),
      );
    });

    it("handles missing/undefined payload without throwing", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { text: "", error: null },
        error: null,
      } as never);

      await expect(functions.invoke("invokeLLM")).resolves.toBeDefined();
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        "llm-proxy",
        expect.objectContaining({ body: {} }),
      );
    });

    it("handles empty prompt object", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { text: "", error: null },
        error: null,
      } as never);

      await expect(functions.invoke("invokeLLM", {})).resolves.toBeDefined();
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });
  });

  describe("number sequencing (rpc path)", () => {
    it("fails closed when project_id or record_type is missing", async () => {
      await expect(
        functions.invoke("numberSequence", { project_id: "p1" }),
      ).rejects.toThrow(/Invalid numberSequence payload/i);
      expect(supabase.rpc).not.toHaveBeenCalled();

      await expect(
        functions.invoke("secureNumberSequence", { record_type: "rfi" }),
      ).rejects.toThrow(/Invalid numberSequence payload/i);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("calls get_next_sequence_number RPC and returns the number", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 42,
        error: null,
      } as never);

      await expect(
        functions.invoke("numberSequence", {
          project_id: "11111111-1111-4111-8111-111111111111",
          record_type: "rfi",
        }),
      ).resolves.toEqual({ data: { number: 42 } });

      expect(supabase.rpc).toHaveBeenCalledWith("get_next_sequence_number", {
        p_project_id: "11111111-1111-4111-8111-111111111111",
        p_record_type: "rfi",
      });
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });
});
