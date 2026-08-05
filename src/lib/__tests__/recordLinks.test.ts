import { describe, expect, it } from "vitest";

import { buildRecordLink } from "../recordLinks";

describe("buildRecordLink", () => {
  it.each([
    ["project", "/Projects"],
    ["rfi", "/RFIs"],
    ["change_order", "/ChangeOrders"],
    ["drawing_revision", "/DrawingViewer"],
    ["schedule_task", "/Schedule"],
    ["submittal", "/Submittals"],
  ] as const)("builds the canonical %s route", (entityType, path) => {
    expect(buildRecordLink({
      baseUrl: "https://steelbuild-pro.vercel.app",
      entityType,
      projectId: "project-1",
      recordId: "record-42",
      ...(entityType === "drawing_revision" ? { revisionId: "revision-3" } : {}),
    })).toBe(
      `https://steelbuild-pro.vercel.app${path}?projectId=project-1&recordId=record-42${entityType === "drawing_revision" ? "&revisionId=revision-3" : ""}`,
    );
  });

  it("encodes identifiers through URLSearchParams", () => {
    expect(buildRecordLink({
      baseUrl: "https://steelbuild-pro.vercel.app",
      entityType: "rfi",
      projectId: "project / one",
      recordId: "rfi?42&next=true",
    })).toBe("https://steelbuild-pro.vercel.app/RFIs?projectId=project+%2F+one&recordId=rfi%3F42%26next%3Dtrue");
  });

  it("accepts HTTP only for local development origins", () => {
    expect(buildRecordLink({
      baseUrl: "http://localhost:5173",
      entityType: "project",
      projectId: "project-1",
      recordId: "project-1",
    })).toBe("http://localhost:5173/Projects?projectId=project-1&recordId=project-1");

    expect(() => buildRecordLink({
      baseUrl: "http://steelbuild.example.com",
      entityType: "project",
      projectId: "project-1",
      recordId: "project-1",
    })).toThrow(/HTTPS/);
  });

  it("rejects unsupported entity types and caller-supplied URL state", () => {
    expect(() => buildRecordLink({
      baseUrl: "https://steelbuild-pro.vercel.app",
      entityType: "invoice" as never,
      projectId: "project-1",
      recordId: "invoice-1",
    })).toThrow(/Unsupported/);

    for (const baseUrl of [
      "https://steelbuild-pro.vercel.app/RFIs",
      "https://steelbuild-pro.vercel.app?recordId=attacker",
      "https://steelbuild-pro.vercel.app/#fragment",
      "https://user:secret@steelbuild-pro.vercel.app",
    ]) {
      expect(() => buildRecordLink({
        baseUrl,
        entityType: "rfi",
        projectId: "project-1",
        recordId: "rfi-1",
      })).toThrow();
    }
  });

  it("requires a revision ID only for drawing revision links", () => {
    expect(() => buildRecordLink({
      baseUrl: "https://steelbuild-pro.vercel.app",
      entityType: "drawing_revision",
      projectId: "project-1",
      recordId: "drawing-1",
    })).toThrow(/revisionId/);

    expect(() => buildRecordLink({
      baseUrl: "https://steelbuild-pro.vercel.app",
      entityType: "rfi",
      projectId: "project-1",
      recordId: "rfi-1",
      revisionId: "revision-1",
    })).toThrow(/revisionId/);
  });
});
