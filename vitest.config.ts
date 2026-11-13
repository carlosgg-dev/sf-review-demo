import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts only wires the app together; acceptance tests start the app through buildApp.
      // Persistence talks to SQLite and is covered by the integration tests instead.
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/persistence/**"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
