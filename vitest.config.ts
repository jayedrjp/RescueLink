import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone test config (kept separate from vite.config.ts so the TanStack Start/Nitro plugins
// are not loaded when running unit tests).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test-utils/setup-dom.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Needs the Firestore emulator; run with `npm run test:rules`.
    exclude: ["**/node_modules/**", "**/*.emulator.test.ts"],
    globals: false,
    restoreMocks: true,
  },
});
