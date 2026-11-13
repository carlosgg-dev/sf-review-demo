import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { ignores } from "./eslint.ignores.js";

export default defineConfig(ignores, {
  files: ["**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: { complexity: ["error", 8] },
});
