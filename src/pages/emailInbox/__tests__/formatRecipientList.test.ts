/**
 * recipients is jsonb written as a JSON string by both edge functions, but
 * older/other writers can hold a real array. The detail pane once rendered
 * raw JSON for the string shape and crashed (JSON.parse(array)) on the array
 * shape — this pins the tolerant formatter.
 */
import { describe, it, expect } from "vitest";
import { formatRecipientList } from "../components";

describe("formatRecipientList", () => {
  it("parses the JSON-string shape written by email-ingest/email-send", () => {
    expect(formatRecipientList('["gc@acme.com","pm@acme.com"]')).toBe("gc@acme.com, pm@acme.com");
  });

  it("joins a real jsonb array without throwing", () => {
    expect(formatRecipientList(["gc@acme.com", "pm@acme.com"])).toBe("gc@acme.com, pm@acme.com");
  });

  it("passes through a plain email string that is not JSON", () => {
    expect(formatRecipientList("gc@acme.com")).toBe("gc@acme.com");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatRecipientList(null)).toBe("");
    expect(formatRecipientList(undefined)).toBe("");
  });
});
