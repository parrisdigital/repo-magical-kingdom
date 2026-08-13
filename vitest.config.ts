import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // GitHub's two-core hosted runner can starve the cold procedural scatter
    // stress test when several geometry files compete in parallel. Keep every
    // assertion and timeout intact, but serialize files in CI so each test gets
    // predictable CPU time. Local development remains file-parallel.
    fileParallelism: !process.env.CI,
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
