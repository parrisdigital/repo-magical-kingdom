import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Procedural world fixtures can legitimately exceed Vitest's 5s default
    // when GitHub's shared runner executes several geometry suites in parallel.
    testTimeout: 15_000,
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
