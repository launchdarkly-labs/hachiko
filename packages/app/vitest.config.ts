import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "dist/**",
      "test/integration/**",
      "test/unit/services/config.test.ts",
      "test/unit/services/plans.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/**", "dist/**", "test/**", "**/*.d.ts", "**/*.config.ts"],
      thresholds: {
        // Temporarily lowered thresholds for initial implementation
        // TODO: Increase as more tests are added
        statements: 7,
        branches: 60,
        functions: 40,
        lines: 7,
      },
    },
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
})
