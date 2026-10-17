import { defineConfig } from "vitest/config";

// Suite de integración: abre sockets locales y lanza procesos (npm run build, Vite).
export default defineConfig({
  test: {
    include: ["tests/**/*.int.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
