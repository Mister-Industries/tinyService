import { createEslintConfig } from "@tinyservice/eslint-config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default createEslintConfig(__dirname);
