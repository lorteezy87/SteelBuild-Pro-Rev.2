import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const plannerRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: plannerRoot,
  publicDir: path.resolve(plannerRoot, "public"),
  resolve: {
    alias: {
      "@planner": path.resolve(plannerRoot, "src"),
      "@": path.resolve(plannerRoot, "../src"),
    },
  },
  plugins: [react()],
  build: { outDir: path.resolve(plannerRoot, "../dist-planner"), emptyOutDir: true },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [
      path.resolve(plannerRoot, "../vitest.setup.js"),
      path.resolve(plannerRoot, "../src/setupTests.ts"),
    ],
  },
});
