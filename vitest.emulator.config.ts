import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Used only by `npm run test:rules` (needs the Firestore emulator).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.emulator.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
