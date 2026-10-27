import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests run through Vite, separate from Next's build; CI still runs `typecheck`
// and `build`. See docs/design/adr-0001 in Nova-Collected.
export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` alias from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      reporter: ["text-summary", "lcov", "cobertura"],
    },
  },
});
