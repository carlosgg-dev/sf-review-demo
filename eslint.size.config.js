import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { ignores } from "./eslint.ignores.js";

// Test files are exempt: describe callbacks are long by nature.
export default defineConfig(ignores, {
  files: ["src/**/*.ts"],
  ignores: ["src/**/*.test.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
    "max-lines-per-function": ["error", { max: 40, skipBlankLines: false, skipComments: false }],
  },
});
