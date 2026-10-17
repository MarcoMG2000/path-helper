import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Capas (docs/architecture.md §5): rules y data son puras; web nunca importa de server.
const serverPatterns = ["**/server", "**/server/**"];
const webPatterns = ["**/web", "**/web/**"];

function restrict(patterns, message) {
  return {
    "no-restricted-imports": [
      "error",
      { patterns: patterns.map((group) => ({ group: [group], message })) },
    ],
  };
}

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", ".cache/**", "reports/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-console": "error" },
  },
  {
    files: ["src/rules/**/*.{ts,tsx}", "src/data/**/*.{ts,tsx}"],
    rules: restrict(
      [...serverPatterns, ...webPatterns],
      "Las capas rules y data no pueden importar de server ni de web.",
    ),
  },
  {
    files: ["src/web/**/*.{ts,tsx}"],
    rules: restrict(serverPatterns, "web no puede importar de server."),
  },
);
