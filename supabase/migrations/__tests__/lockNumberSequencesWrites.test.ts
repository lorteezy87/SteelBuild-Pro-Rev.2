import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// RLS-4: official-number counters must be writable only by the atomic RPC.
// The file is authored under a placeholder version and renamed to the ledger
// version at apply time, so find it by name rather than by full filename.
const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const lockFile = files.find((name) => name.endsWith("_lock_number_sequences_writes.sql"));
if (!lockFile) throw new Error("lock_number_sequences_writes migration is missing");
const sql = fs.readFileSync(path.join(migrationsDir, lockFile), "utf8");
// The executable part, without the comments' prose.
const body = sql.replace(/--.*$/gm, "");

const CLIENT_WRITE = ["INSERT", "UPDATE", "DELETE", "ALL"];
const SERVER_ROLES = new Set(["postgres", "service_role", "supabase_admin"]);

type Policy = { name: string; permissive: boolean; cmd: string; roles: string[] };

// Every migration that mentions the table or the RPC, in version order, read once.
const relevant = files
  .map((file) => ({ file, text: fs.readFileSync(path.join(migrationsDir, file), "utf8") }))
  .filter(({ text }) => /number_sequences|get_next_sequence_number/.test(text));

/**
 * Replays every statically written CREATE/DROP POLICY on number_sequences in
 * version order. The format()-generated restrictive role floors of
 * 20260702034009 are invisible to this — they are RESTRICTIVE, so they cannot
 * grant a write either way.
 */
function finalNumberSequencePolicies(): Map<string, Policy> {
  const policies = new Map<string, Policy>();
  const statement =
    /\b(create|drop)\s+policy\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+(?:"?public"?\s*\.\s*)?"?number_sequences"?\b([^;]*)/gi;
  for (const { text: raw } of relevant) {
    const text = raw.replace(/--.*$/gm, "");
    for (const [, verb, name, rest] of text.matchAll(statement)) {
      if (verb.toLowerCase() === "drop") {
        policies.delete(name);
        continue;
      }
      const cmd = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(rest)?.[1].toUpperCase() ?? "ALL";
      const to = /\bto\s+([\s\S]*?)(?:\busing\b|\bwith\s+check\b|$)/i.exec(rest)?.[1] ?? "public";
      policies.set(name, {
        name,
        permissive: !/\bas\s+restrictive\b/i.test(rest),
        cmd,
        roles: to.split(",").map((role) => role.replace(/"/g, "").trim().toLowerCase()),
      });
    }
  }
  return policies;
}

/** The header of the last CREATE OR REPLACE of the RPC across all migrations. */
function lastRpcDefinition(): { file: string; header: string; body: string } {
  let last: { file: string; header: string; body: string } | undefined;
  const definition =
    /create\s+or\s+replace\s+function\s+(?:"?public"?\s*\.\s*)?"?get_next_sequence_number"?\s*\(([\s\S]*?)\bas\s+(\$\w*\$)([\s\S]*?)\2/gi;
  for (const { file, text } of relevant) {
    for (const match of text.matchAll(definition)) {
      last = { file, header: match[1], body: match[3] };
    }
  }
  if (!last) throw new Error("no migration defines get_next_sequence_number");
  return last;
}

describe("lock number_sequences writes to the RPC (RLS-4)", () => {
  it("carries a placeholder version that must be renamed to the ledger version", () => {
    expect(sql).toMatch(/PLACEHOLDER VERSION/);
    expect(sql).toContain("ARCHITECTURE.md");
    expect(sql).toMatch(/Rename this file to the version production records/);
  });

  it("drops every client write policy, replay-safely", () => {
    for (const name of ["project_insert", "project_update", "project_delete", "project_member_access"]) {
      expect(body).toContain(`drop policy if exists ${name} on public.number_sequences;`);
    }
    expect(body).not.toMatch(/create\s+policy/i);
    // The preview read in numberSequencing.jsx keeps working.
    expect(body).not.toMatch(/drop\s+policy[^;]*project_select/i);
  });

  it("takes the table write privileges too, TRUNCATE included", () => {
    expect(body).toContain(
      "revoke insert, update, delete, truncate on table public.number_sequences\n    from public, anon, authenticated;",
    );
    expect(body).not.toMatch(/revoke[^;]*\bselect\b[^;]*number_sequences/i);
  });

  it("aborts unless the RPC is a pinned SECURITY DEFINER function", () => {
    expect(body).toContain("to_regprocedure('public.get_next_sequence_number(uuid,text)')");
    expect(body).toContain("p.prosecdef");
    expect(body).toContain("c like 'search_path=%'");
    expect(body).toMatch(/raise exception 'public\.get_next_sequence_number is not a SECURITY DEFINER/);
  });

  it("aborts rather than break a SECURITY INVOKER writer or leave an unknown policy", () => {
    expect(body).toContain("and not p.prosecdef");
    expect(body).toMatch(/raise exception 'SECURITY INVOKER function\(s\) write number_sequences/);
    expect(body).toMatch(/raise exception 'Unreviewed client write policy on number_sequences/);
    // The unknown-policy check runs after the known drops, or it would trip on them.
    expect(body.indexOf("Unreviewed client write policy")).toBeGreaterThan(
      body.indexOf("drop policy if exists project_delete"),
    );
  });

  it("reloads the PostgREST schema cache last", () => {
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });

  it("leaves no permissive client write policy after replaying every migration", () => {
    const writers = [...finalNumberSequencePolicies().values()].filter(
      (policy) =>
        policy.permissive &&
        CLIENT_WRITE.includes(policy.cmd) &&
        policy.roles.some((role) => !SERVER_ROLES.has(role)),
    );
    expect(writers).toEqual([]);
    // Sanity: the parser does see the baseline's policies.
    const kept = finalNumberSequencePolicies();
    expect(kept.get("project_select")).toMatchObject({ cmd: "SELECT" });
    expect(kept.get("postgres_full_access")?.roles).toEqual(["postgres"]);
  });

  it("the RPC's latest definition is SECURITY DEFINER with a pinned search_path and an access check", () => {
    const rpc = lastRpcDefinition();
    expect(rpc.header).toMatch(/security\s+definer/i);
    expect(rpc.header).toMatch(/set\s+"?search_path"?\s+(to|=)/i);
    expect(rpc.body).toContain("public.user_has_project_access(p_project_id)");
    // Nothing later flips it back to invoker or unpins it.
    for (const { text } of relevant.filter(({ file }) => file > rpc.file)) {
      expect(text).not.toMatch(/alter\s+function[^;]*get_next_sequence_number[^;]*(security\s+invoker|reset\s+search_path)/i);
    }
  });
});
