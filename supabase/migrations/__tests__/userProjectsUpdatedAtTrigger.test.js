import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = path.resolve(process.cwd(), "supabase/migrations");
const baseline = fs.readFileSync(
  path.join(migrationDirectory, "20260101000010_baseline_schema.sql"),
  "utf8",
);
const remediation = fs.readFileSync(
  path.join(
    migrationDirectory,
    "20260716081258_drop_invalid_user_projects_updated_at_trigger.sql",
  ),
  "utf8",
);

describe("user_projects timestamp trigger remediation", () => {
  it("removes only the trigger that targets the missing updated_at column", () => {
    expect(baseline).toMatch(
      /create\s+or\s+replace\s+trigger\s+"?trg_user_projects_updated_at"?[\s\S]+?on\s+"?public"?\."?user_projects"?/i,
    );
    expect(remediation).toMatch(
      /drop\s+trigger\s+if\s+exists\s+trg_user_projects_updated_at\s+on\s+public\.user_projects/i,
    );
    expect(remediation).not.toMatch(
      /drop\s+trigger[\s\S]+?user_projects_member_activity_log/i,
    );
    expect(remediation).not.toMatch(
      /drop\s+trigger[\s\S]+?user_projects_membership_identity_check/i,
    );
  });
});
