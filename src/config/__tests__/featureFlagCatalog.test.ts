import { describe, expect, it } from "vitest";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";

describe("feature flag catalog", () => {
  it("has unique keys", () => {
    const keySet = new Set(FEATURE_FLAG_KEYS);
    expect(keySet.size).toBe(FEATURE_FLAG_KEYS.length);
  });

  it("contains only lowercase snake_case keys", () => {
    const allowed = /^[a-z0-9_]+$/;
    const invalid = FEATURE_FLAG_KEYS.filter((key) => !allowed.test(key));
    expect(invalid).toEqual([]);
  });
});

