import { describe, expect, it } from "vitest";
import {
  SYNC_UNAVAILABLE_MESSAGE,
  buildLinkedFolderSyncDefaults,
  buildUnavailableSyncStatusPatch,
} from "../sharepointSyncHonesty";

describe("sharepointSyncHonesty", () => {
  it("marks sync unavailable without bumping last_sync_at", () => {
    const patch = buildUnavailableSyncStatusPatch();
    expect(patch).toEqual({ last_sync_status: "unavailable" });
    expect(patch).not.toHaveProperty("last_sync_at");
  });

  it("creates linked folders with sync disabled until the connector exists", () => {
    expect(buildLinkedFolderSyncDefaults({ syncFrequency: "daily" })).toEqual({
      sync_enabled: false,
      sync_frequency: "daily",
    });
  });

  it("exposes a non-success operator message", () => {
    expect(SYNC_UNAVAILABLE_MESSAGE.toLowerCase()).toContain("not connected");
    expect(SYNC_UNAVAILABLE_MESSAGE.toLowerCase()).not.toContain("synced successfully");
  });
});
