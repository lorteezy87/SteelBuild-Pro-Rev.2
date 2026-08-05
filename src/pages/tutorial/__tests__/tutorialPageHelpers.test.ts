import { describe, expect, it } from "vitest";
import { slugify, buildToc, filterMarkdownBySearch } from "../tutorialPageHelpers";

describe("tutorialPageHelpers", () => {
  it("slugify and toc", () => {
    expect(slugify("1. Hello World!")).toBe("1-hello-world");
    const md = "# Title\n\n## 1. Setup\nbody\n### 1.1 Detail\n## 2. Next\n";
    const toc = buildToc(md);
    expect(toc.map((t) => t.id)).toEqual(["1-setup", "11-detail", "2-next"]);
    expect(toc[0].depth).toBe(2);
    expect(toc[1].depth).toBe(3);
  });

  it("filters markdown by search", () => {
    const md = "preamble\n## Alpha\nfoo bar\n## Beta\nbaz qux\n";
    expect(filterMarkdownBySearch(md, "")).toBe(md);
    const filtered = filterMarkdownBySearch(md, "baz");
    expect(filtered).toContain("Beta");
    expect(filtered).not.toContain("foo bar");
    expect(filtered.startsWith("preamble")).toBe(true);
  });
});
