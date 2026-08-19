/**
 * Migration lag used to reach the user as raw PostgREST text — e.g.
 *   "Save failed: [drawing_sets.update] Could not find the
 *    'titleblock_revision_rect' column of 'drawing_sets' in the schema cache"
 * which reads as a crash and tells them nothing they can act on. It now maps to
 * actionable copy; the operator-facing detail still goes to Sentry through
 * normalizeThrownQueryError.
 */
import { describe, expect, it } from "vitest";
import {
  describeMissingSchemaObject,
  isMissingSchemaObjectError,
  missingSchemaObjectUserMessage,
} from "../postgrestErrors";
import { toUserErrorMessage } from "../mutations/standardMutation";

const columnError = {
  code: "PGRST204",
  message: "Could not find the 'titleblock_revision_rect' column of 'drawing_sets' in the schema cache",
};
const tableError = { code: "PGRST205", message: "Could not find the table 'public.note_folders' in the schema cache" };
const fnError = { code: "PGRST202", message: "Could not find the function public.apply_project_template" };

describe("describeMissingSchemaObject", () => {
  it("names a missing column and its table", () => {
    expect(describeMissingSchemaObject(columnError)).toBe("titleblock_revision_rect on drawing_sets");
  });

  it("names a missing table without the schema prefix", () => {
    expect(describeMissingSchemaObject(tableError)).toBe("note_folders");
  });

  it("names a missing function", () => {
    expect(describeMissingSchemaObject(fnError)).toBe("apply_project_template");
  });

  it("returns empty when nothing is identifiable", () => {
    expect(describeMissingSchemaObject({ message: "boom" })).toBe("");
    expect(describeMissingSchemaObject(null)).toBe("");
  });
});

describe("missingSchemaObjectUserMessage", () => {
  it("says what is needed, who can fix it, and that nothing saved", () => {
    const msg = missingSchemaObjectUserMessage(columnError);
    expect(msg).toMatch(/pending database update/i);
    expect(msg).toMatch(/titleblock_revision_rect on drawing_sets/);
    expect(msg).toMatch(/admin/i);
    expect(msg).toMatch(/not saved/i);
  });

  it("never leaks the phrase 'schema cache' to the user", () => {
    expect(missingSchemaObjectUserMessage(columnError)).not.toMatch(/schema cache/i);
  });
});

describe("toUserErrorMessage", () => {
  it("maps schema-cache failures to the actionable message", () => {
    expect(toUserErrorMessage(columnError)).toBe(missingSchemaObjectUserMessage(columnError));
    expect(toUserErrorMessage(new Error(columnError.message))).toMatch(/pending database update/i);
  });

  it("leaves ordinary errors untouched", () => {
    expect(toUserErrorMessage(new Error("Row level security violation"))).toBe("Row level security violation");
    expect(toUserErrorMessage("plain string")).toBe("plain string");
    expect(toUserErrorMessage(undefined, "fallback copy")).toBe("fallback copy");
  });

  it("still recognises the failure for all three PostgREST codes", () => {
    for (const err of [columnError, tableError, fnError]) {
      expect(isMissingSchemaObjectError(err)).toBe(true);
      expect(toUserErrorMessage(err)).toMatch(/pending database update/i);
    }
  });
});
