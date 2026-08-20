import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // design-system is a submodule with its own repo, conventions and lint setup.
  // docs/mockups is throwaway browser HTML for design review, not shipped code.
  {
    ignores: [
      "dist/**",
      "out/**",
      "node_modules/**",
      "media/**",
      "design-system/**",
      "docs/mockups/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The smoke harness is a plain Node script, not extension code: it needs
    // Node globals and it reports its results by printing them.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", setTimeout: "readonly" }
    },
    rules: { "no-console": "off", curly: "off" }
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["error"] }],
      curly: "error"
    }
  }
);
