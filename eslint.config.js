import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

// Shared pragmatic rule set (JS + TS blocks). Tuned for this app: unused IMPORTS
// are errors (real dead code), unused vars are warnings, empty catch is an
// allowed best-effort pattern, and the noisy stylistic React rules are off.
const sharedRules = {
  "react/no-unescaped-entities": "off",
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-unused-vars": "off",
  "react/jsx-uses-vars": "error",
  "react/jsx-uses-react": "error",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "warn",
    { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
  ],
  "react/prop-types": "off",
  "react/react-in-jsx-scope": "off",
  "react/no-unknown-property": ["error", { ignore: ["cmdk-input-wrapper", "toast-close"] }],
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
};

const sharedPlugins = {
  react: pluginReact,
  "react-hooks": pluginReactHooks,
  "unused-imports": pluginUnusedImports,
};

export default [
  {
    ignores: [
      "**/.claude/**",
      "**/.next/**",
      "dist/**",
      "steelbuild-pro/**",
      "node_modules/**",
      "e2e/**",
    ],
  },
  {
    files: [
      "src/**/*.{js,mjs,cjs,jsx}",
    ],
    ignores: [
      "**/.claude/**",
      "**/.next/**",
      "dist/**",
      "steelbuild-pro/**",
      // src/lib + src/api are now linted (finding #8). Still skip vendored shadcn
      // UI primitives, the theme guide doc, and the build-time vite plugins.
      "src/components/ui/**/*",
      "src/components/shared/THEME_DEVELOPER_GUIDE.jsx",
      "src/vite-plugins/**/*",
    ],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      ...sharedPlugins,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,
      // Restore the recommended floor (these were previously dropped because
      // the explicit `rules` block shadowed the spreads above). `no-undef`
      // in particular catches the class of bug that shipped as
      // "qc is not defined".
      "no-undef": "error",
      ...sharedRules,
    },
  },
  // ── TypeScript / TSX (finding #8, step 1) ───────────────────────────────────
  // Previously the entire .ts/.tsx surface was UNLINTED. Lint it with the TS
  // parser + the same pragmatic rules as the JS block. `no-undef` is left OFF
  // here (the TS compiler already resolves identifiers; eslint's no-undef
  // produces false positives on type-only references). Type-aware
  // @typescript-eslint rules are a deliberate later phase.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**/*",
      "src/vite-plugins/**/*",
    ],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      ...sharedPlugins,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...sharedRules,
    },
  },
];
