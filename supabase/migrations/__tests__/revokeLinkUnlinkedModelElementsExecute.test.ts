import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260914122050_revoke_link_unlinked_model_elements_execute.sql",
  ),
  "utf8",
);

const FN = "public.link_unlinked_model_elements_for_piece(uuid)";

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file))
    .map((file) => path.join(dir, file));
}

describe("revoke link_unlinked_model_elements_for_piece EXECUTE", () => {
  it("names anon and authenticated, not PUBLIC alone", () => {
    // Supabase's default privileges grant EXECUTE on new public functions
    // directly to anon/authenticated/service_role. 20260801120000 revoked only
    // PUBLIC and anon, so authenticated kept its direct grant.
    expect(sql).toContain(
      `REVOKE EXECUTE ON FUNCTION ${FN} FROM PUBLIC, anon, authenticated;`,
    );
  });

  it("leaves the service_role grant alone", () => {
    expect(sql).not.toMatch(/^REVOKE[^;]*service_role/im);
  });

  it("checks the effective privileges instead of trusting the REVOKE", () => {
    // A grant from another grantor, or one inherited through a membership,
    // survives the REVOKE. Only has_function_privilege sees what PostgREST will.
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(sql).toContain(`has_function_privilege('${role}', '${FN}', 'EXECUTE')`);
    }
    expect(sql).toContain("is still executable by anon or authenticated");
    expect(sql).toContain("has lost its service_role grant");
  });

  it("reloads the PostgREST schema cache last", () => {
    expect(sql.trimEnd()).toMatch(/NOTIFY pgrst, 'reload schema';$/);
  });

  it("has no caller in the app or Edge Functions, which would now get 42501", () => {
    // The revoke is safe only because the definer trigger is the sole caller.
    // A direct .rpc() call added later would fail for every signed-in user.
    //
    // src/types/supabase.ts is excluded: it is generated from the Postgres
    // catalog, which lists every function regardless of who may EXECUTE it, so
    // the name appears there as a type declaration. Declaring a signature is
    // not calling it — this scan is looking for a caller.
    const GENERATED_TYPES = path.resolve(process.cwd(), "src/types/supabase.ts");
    const callers = ["src", "supabase/functions"]
      .flatMap((dir) => sourceFiles(path.resolve(process.cwd(), dir)))
      .filter((file) => file !== GENERATED_TYPES)
      .filter((file) =>
        fs.readFileSync(file, "utf8").includes("link_unlinked_model_elements_for_piece"),
      );
    expect(callers).toEqual([]);
  });
});
