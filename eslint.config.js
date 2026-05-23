import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [
      "**/.claude/**",
      "**/.next/**",
      "dist/**",
      "steelbuild-pro/**",
      "node_modules/**",
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
      "src/lib/**/*",
      "src/api/**/*",
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
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,
      // Restore the recommended floor (these were previously dropped because
      // the explicit `rules` block shadowed the spreads above). `no-undef`
      // in particular catches the class of bug that shipped as
      // "qc is not defined".
      "no-undef": "error",
      // Apostrophes/quotes in JSX copy are intentional throughout the app;
      // this rule is pure stylistic noise here.
      "react/no-unescaped-entities": "off",
      // Empty catch blocks are a deliberate best-effort pattern in this code.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
