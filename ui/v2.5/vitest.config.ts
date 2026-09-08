import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Kept separate from vite.config.js so the test run does not pull in the
// React and compression plugins the app build needs.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // No DOM. The units under test take their environment as arguments, which
    // keeps the runner free of a jsdom dependency.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
