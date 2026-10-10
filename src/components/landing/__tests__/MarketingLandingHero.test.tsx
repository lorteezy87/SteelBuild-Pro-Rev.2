import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
const landingSource = fs.readFileSync(
  path.join(repositoryRoot, "src/components/landing/MarketingLanding.tsx"),
  "utf8",
);
const landingStyles = fs.readFileSync(
  path.join(repositoryRoot, "src/styles/marketing-landing.css"),
  "utf8",
);
const heroPath = path.join(
  repositoryRoot,
  "public/marketing/photos/steelbuild-hero-user-enhanced.png",
);

describe("marketing landing hero provenance", () => {
  it("tracks and references the exact enhanced Sites v18 hero", () => {
    expect(landingSource).toContain(
      'src="/marketing/photos/steelbuild-hero-user-enhanced.png"',
    );
    expect(landingSource).toContain(
      'alt="Active high-rise construction site with cranes and steel framing at sunset"',
    );
    expect(fs.existsSync(heroPath)).toBe(true);

    const heroHash = createHash("sha256")
      .update(fs.readFileSync(heroPath))
      .digest("hex")
      .toUpperCase();
    expect(heroHash).toBe(
      "120F1B961692A77EF2F02454F62CCAA4E61F3F69F9496BE47E1AD8659C719BE9",
    );
  });

  it("centers the enhanced image in both production crop overrides", () => {
    expect(landingStyles).toContain(
      ".marketing-landing .hero-background{inset:0 0 0 auto;width:62%;object-position:center center}",
    );
    expect(landingStyles).toContain(
      ".marketing-landing .hero-background{position:relative;inset:auto;display:block;width:calc(100% + 40px);height:300px;margin:34px -20px 0;object-position:center center;z-index:0}",
    );
  });
});
