import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Piece Register wiring regression guards", () => {
  it("keeps the command-deck Piece Register page and stylesheet", () => {
    expect(existsSync(resolve(root, "src/pages/PieceRegister.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/styles/piece-control-command.css"))).toBe(true);
    expect(existsSync(resolve(root, "src/components/pieceControl/PieceControlDashboardPanel.tsx"))).toBe(true);

    const page = read("src/pages/PieceRegister.tsx");
    expect(page).toContain('import "@/styles/piece-control-command.css"');
    expect(page).toContain("useCommandSkin()");
    expect(page).toContain('className="piece-control-command"');
    expect(page).not.toContain("min-h-screen bg-[radial-gradient");
  });

  it("does not keep the obsolete CanonicalPieceDashboard implementation", () => {
    expect(existsSync(resolve(root, "src/components/dashboard/CanonicalPieceDashboard.tsx"))).toBe(false);

    const dashboard = read("src/pages/Dashboard.jsx");
    const controlCenter = read("src/pages/dashboardCC/DashboardControlCenter.tsx");
    expect(dashboard).not.toContain("CanonicalPieceDashboard");
    expect(controlCenter).not.toContain("CanonicalPieceDashboard");
  });

  it("opens Piece Register from the dashboard command panel", () => {
    const dashboard = read("src/pages/Dashboard.jsx");
    const controlCenter = read("src/pages/dashboardCC/DashboardControlCenter.tsx");
    const routes = read("src/config/routes.js");

    expect(routes).toContain('PieceRegister:      r(lazyWithRetry(() => import("@/pages/PieceRegister"))');
    expect(dashboard).toContain('"piece-register": "/PieceRegister"');
    expect(controlCenter).toContain('import { PieceControlDashboardPanel } from "@/components/pieceControl/PieceControlDashboardPanel"');
    expect(controlCenter).toContain("PieceControlDashboardPanel");
    expect(controlCenter).toContain('onNavigate?.("piece-register")');
  });
});
