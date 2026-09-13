import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

const restoredMigrations = [
  {
    filename: "20260802090000_planner_action_control.sql",
    blob: "8e3aab6595bcc97575c2667e0dd8e3c045e9f2ef",
  },
  {
    filename: "20260802090500_planner_offline_idempotency.sql",
    blob: "26216f3247b0cc63dc0ff03e7f756b0f64c9b762",
  },
];

function gitBlobId(contents: Buffer): string {
  return createHash("sha1")
    .update(`blob ${contents.length}\0`)
    .update(contents)
    .digest("hex");
}

describe("Planner migration lineage restoration", () => {
  it.each(restoredMigrations)(
    "keeps $filename byte-identical to its surviving git object",
    ({ filename, blob }) => {
      const contents = fs.readFileSync(path.join(here, "..", filename));
      expect(gitBlobId(contents)).toBe(blob);
    },
  );
});
