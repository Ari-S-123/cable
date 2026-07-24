import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat ESLint configuration for JavaScript, TypeScript 7 syntax, React, and
 * Next.js. Babel supplies the syntax-only parser because typescript-eslint's
 * TypeScript 6 compiler API intentionally rejects TypeScript 7.
 */
export default defineConfig([
  globalIgnores([
    ".next/**",
    ".convex/**",
    "coverage/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "convex/_generated/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    ...js.configs.recommended,
    plugins: {
      "@next/next": nextPlugin,
      jsdoc,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAnyKeyword",
          message:
            "Use a precise type or unknown and validate it at the boundary; any is forbidden.",
        },
        {
          selector: "TSInterfaceDeclaration",
          message:
            "Prefer a TypeScript type alias for authored functional code.",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ["typescript", "jsx"] },
        },
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/hooks/use-mobile.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
    },
  },
]);
