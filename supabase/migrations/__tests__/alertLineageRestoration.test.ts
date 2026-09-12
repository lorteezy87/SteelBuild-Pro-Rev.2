import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const filename = "20260906040515_fix_alerts_superseded_status.sql";

describe("alert migration lineage restoration", () => {
  it("keeps the recovered apply_migration payload byte-identical", () => {
    const contents = fs.readFileSync(path.join(here, "..", filename));
    expect(contents).toHaveLength(4_899);
    expect(createHash("sha256").update(contents).digest("hex")).toBe(
      "f1c7c1b81c6cd0a451b1e896ab9f2e9ebc120704f21699c80a5d723caaaf3358",
    );
  });
});
