import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  encodeCursor,
  parseReadRequest,
} from "../contract";

const projectId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";

describe("command-center read contract", () => {
  it("accepts one entity with bounded project narrowing and defaults", () => {
    expect(parseReadRequest({
      schemaVersion: 1,
      entityTypes: ["rfi"],
      projectIds: [projectId],
    })).toMatchObject({ limitPerEntity: 100, entityTypes: ["rfi"] });
  });

  it("rejects multiple entities, duplicates, unknown fields, and over-limit reads", () => {
    expect(() => parseReadRequest({ schemaVersion: 1, entityTypes: ["rfi", "project"] })).toThrow();
    expect(() => parseReadRequest({ schemaVersion: 1, entityTypes: ["rfi"], projectIds: [projectId, projectId] })).toThrow();
    expect(() => parseReadRequest({ schemaVersion: 1, entityTypes: ["rfi"], limitPerEntity: 251 })).toThrow();
    expect(() => parseReadRequest({ schemaVersion: 1, entityTypes: ["rfi"], table: "users" })).toThrow();
  });

  it("round-trips an opaque stable cursor and rejects entity mismatch", () => {
    const cursor = encodeCursor({
      version: 1,
      entityType: "rfi",
      updatedAt: "2026-07-21T20:00:00.000Z",
      id: recordId,
    });
    expect(cursor).not.toContain("2026-07-21");
    expect(decodeCursor(cursor, "rfi")).toEqual({
      version: 1,
      entityType: "rfi",
      updatedAt: "2026-07-21T20:00:00.000Z",
      id: recordId,
    });
    expect(() => decodeCursor(cursor, "submittal")).toThrow(/entity/i);
    expect(() => decodeCursor("not-a-cursor", "rfi")).toThrow();
  });
});
