import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nPlugin from "eslint-plugin-n";
// import importPlugin from "eslint-plugin-import-x";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nPlugin.configs["flat/recommended-module"],
  // importPlugin.flatConfigs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
      // "import/order": [
      //   "warn",
      //   {
      //     groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
      //     "newlines-between": "always",
      //     alphabetize: { order: "asc" },
      //   },
      // ],
    },
  },
  eslintConfigPrettier,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
