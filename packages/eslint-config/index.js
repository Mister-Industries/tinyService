import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export const createEslintConfig = (tsconfigRootDir) => {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      ignores: ["node_modules", "dist"],
    },
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          ...(tsconfigRootDir && { tsconfigRootDir }),
        },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
  );
};
