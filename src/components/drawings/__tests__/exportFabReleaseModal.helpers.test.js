// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/api/supabaseClient", () => ({ resolveFileUrl: vi.fn(), entities: {} }));

import { resolveDrawingSetKey } from "../ExportFabReleaseModal";

describe("resolveDrawingSetKey", () => {
  const sets = [
    { id: "set-1", set_name: "Main Steel" },
    { id: "set-dead", set_name: "Old", is_deleted: true },
  ];

  it("uses the FK when present", () => {
    expect(resolveDrawingSetKey({ drawing_set_id: "set-1", drawing_set_name: "Whatever" }, sets)).toBe("set-1");
  });

  it("maps a legacy name-only sheet onto its FK siblings' set id (case/space-insensitive)", () => {
    expect(resolveDrawingSetKey({ drawing_set_name: " main steel " }, sets)).toBe("set-1");
  });

  it("falls back to the raw name when no live set matches", () => {
    expect(resolveDrawingSetKey({ drawing_set_name: "Old" }, sets)).toBe("Old");
    expect(resolveDrawingSetKey({ drawing_set_name: "Misc" }, sets)).toBe("Misc");
  });

  it("returns null for sheets with no set at all", () => {
    expect(resolveDrawingSetKey({}, sets)).toBeNull();
    expect(resolveDrawingSetKey(null, sets)).toBeNull();
  });
});
