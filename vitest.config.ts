import { defineConfig } from "vitest/config";

// Suite unitaria: todo salvo los tests de integración (*.int.test.*).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**/*.int.test.{ts,tsx}"],
    environment: "node",
    // R50 (f3): `globalThis.fetch` lanza en los tests unitarios.
    setupFiles: ["tests/setup/no-network.ts"],
  },
});
