import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Piece Register native dropdown theme", () => {
  it("marks the light Piece Register surface so Windows option menus stay light", () => {
    const source = readFileSync(fileURLToPath(new URL("../../PieceRegister.tsx", import.meta.url)), "utf8");
    expect(source).toMatch(/data-theme=["']light["']/);
  });
});
