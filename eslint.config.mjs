import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "reports",
    "tests",
    "main.js",
    "esbuild.config.mjs",
    "package-lock.json",
    "tsconfig.json"
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "manifest.json", "scripts/*.mjs"]
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"]
      }
    }
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
      "obsidianmd/no-nodejs-modules": "off"
    }
  },
  {
    files: ["manifest.json"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        extraFileExtensions: [".json"]
      }
    },
    plugins: {
      obsidianmd
    },
    rules: {
      "obsidianmd/validate-manifest": "error"
    }
  }
);
