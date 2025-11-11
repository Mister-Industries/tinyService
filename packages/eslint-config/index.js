import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export const createEslintConfig = () => {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      ignores: ["node_modules", "dist"],
    },
  );
};
