import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Delegate all testing to the app package
    include: ["packages/app/test/unit/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "dist/**",
      "packages/app/test/integration/**",
      "packages/app/test/unit/services/config.test.ts",
      "packages/app/test/unit/services/plans.test.ts",
    ],
  },
})
