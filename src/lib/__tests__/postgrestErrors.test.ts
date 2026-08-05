import { describe, expect, it } from "vitest";
import {
  isMissingSchemaObjectError,
  normalizeThrownQueryError,
  postgrestErrorMessage,
} from "../postgrestErrors";

describe("postgrestErrors", () => {
  it("detects PGRST205 missing-table failures", () => {
    expect(
      isMissingSchemaObjectError({
        code: "PGRST205",
        message:
          "Could not find the table 'public.submittal_comment_dispositions' in the schema cache",
        hint: "Perhaps you meant the table 'public.submittal_sheet_responses'",
      }),
    ).toBe(true);
  });

  it("detects PGRST202 missing-function failures", () => {
    expect(
      isMissingSchemaObjectError({
        code: "PGRST202",
        message:
          "Could not find the function public.link_model_elements_to_pieces(p_project_id) in the schema cache",
      }),
    ).toBe(true);
  });

  it("normalizes plain PostgREST objects into Error instances", () => {
    const normalized = normalizeThrownQueryError({
      code: "PGRST205",
      message: "Could not find the table 'public.submittal_comment_dispositions' in the schema cache",
    });
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toMatch(/submittal_comment_dispositions/);
    expect(postgrestErrorMessage(normalized)).toMatch(/submittal_comment_dispositions/);
  });
});
