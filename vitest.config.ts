import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for deterministic policy, contract, and component tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@cable/policy-sandbox": path.resolve(
        import.meta.dirname,
        "./policy-sandbox/src/index.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "policy-sandbox/tests/**/*.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
