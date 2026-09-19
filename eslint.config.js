import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

// jsx-a11y as WARNINGS ONLY. The repo has ~180 pre-existing clickable-div /
// label-association violations and CI runs `eslint . --quiet` (warnings are
// suppressed, only errors fail). Setting any of these to "error" would break
// CI immediately, so we take the plugin's recommended ruleset and force EVERY
// rule to "warn" — new a11y issues surface locally without gating the build.
// The remediation is incremental: promote individual rules to "error" only
// after their existing violations are cleaned up.
const jsxA11yWarnRules = Object.fromEntries(
  Object.keys(pluginJsxA11y.configs.recommended.rules).map((rule) => {
    const configured = pluginJsxA11y.configs.recommended.rules[rule];
    // Preserve any per-rule options the recommended config sets, but force the
    // severity to "warn" regardless of how the recommended config declared it.
    const options = Array.isArray(configured) ? configured.slice(1) : [];
    return [rule, ["warn", ...options]];
  }),
);

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
  // Accessibility lint — warnings only (see jsxA11yWarnRules above).
  ...jsxA11yWarnRules,
};

const sharedPlugins = {
  react: pluginReact,
  "react-hooks": pluginReactHooks,
  "unused-imports": pluginUnusedImports,
  "jsx-a11y": pluginJsxA11y,
};

// Rules for every JavaScript block. As with tsRules below, the src/ and scripts/
// blocks share this one object so tooling code can never be linted more
// leniently than app code.
const jsRules = {
  ...pluginJs.configs.recommended.rules,
  ...pluginReact.configs.flat.recommended.rules,
  // Restore the recommended floor. A block's explicit `rules` key replaces the
  // rules of any config spread into that block, which once dropped these from
  // the src/ block. `no-undef` in particular catches the class of bug that
  // shipped as "qc is not defined".
  "no-undef": "error",
  ...sharedRules,
};

// Rules for every TypeScript block. The src/ and scripts/ blocks share this one
// object so tooling code can never be linted more leniently than app code.
const tsRules = {
  ...pluginReact.configs.flat.recommended.rules,
  ...sharedRules,
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
      ".tmp/**",
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
    rules: jsRules,
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
    rules: tsRules,
  },
  // ── TypeScript under scripts/ ───────────────────────────────────────────────
  // Node tooling and its tests. With no block matching them, `eslint .` skipped
  // every scripts/**/*.ts as "File ignored because no matching configuration
  // was supplied" and still exited 0. Same parser and rules as the src/ TS
  // block above; Node globals instead of browser ones.
  {
    files: ["scripts/**/*.{ts,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
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
    rules: tsRules,
  },
  // ── JavaScript under scripts/ ───────────────────────────────────────────────
  // ESLint 9 matches **/*.{js,mjs,cjs} by default, so `eslint .` visited these
  // files, but no block configured them and they passed against zero rules:
  // the enforced Supabase drift check, the audit gate, the storage backup and
  // the typecheck ratchet runners among them. Same rules as the src/ JS block.
  //
  // Globals: ES modules get nodeBuiltin, not node. `globals.node` also declares
  // the CommonJS wrapper variables (require, module, exports, __dirname,
  // __filename). Those don't exist in an ES module, so declaring them would
  // hide the ReferenceError no-undef is here to catch. Only .cjs gets them.
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      // In languageOptions, not parserOptions, so the .cjs block can override it.
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.nodeBuiltin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      ...sharedPlugins,
    },
    rules: jsRules,
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  // ── Unbounded raw PostgREST reads ───────────────────────────────────────────
  // PostgREST caps a response at db-max-rows (1000) and returns 200 OK. A read
  // that exceeds it is silently SHORT — no error, no flag.
  //
  // src/api/client/entityClient.ts handles this properly: an explicit
  // LIST_ROW_CAP, an EFFECTIVE_LIST_CAP that accounts for the server ceiling,
  // and Sentry truncation telemetry. Call sites that reach past it for the raw
  // client get none of that, and it has already shipped two defects — a claims
  // export that silently omitted RFIs/photos past row 1000, and a detailing
  // dedup scan that minted duplicate schedule tasks because it couldn't see the
  // existing ones.
  //
  // So: raw `supabase.from(...)` is banned outside the data layer. Use the
  // `entities.*` client, or `fetchAllRows`/`fetchCapped` from @/lib/pagedQuery
  // when you genuinely need a raw query.
  //
  // ERROR, not warn: `npm run lint` passes --quiet, which suppresses warnings
  // entirely, so a warn-level rule would never fail CI and would never be seen.
  // Every CURRENT call site is enumerated in the ignore list below, so this is
  // green today and blocks only NEW violations. Ratchet it by cleaning a file
  // and deleting it from the list.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      // Mirror the exclusions of the two blocks that configure the JSX parser
      // (the src js/jsx and ts/tsx blocks above). Without these, this block is
      // the ONLY one matching the vendored shadcn primitives and the build-time
      // vite plugins, so ESLint lints them with no JSX support and reports
      // "Parsing error: Unexpected token <" on all 49 of them — nothing to do
      // with this rule.
      "src/components/ui/**/*",
      "src/components/shared/THEME_DEVELOPER_GUIDE.jsx",
      "src/vite-plugins/**/*",
      // The data layer itself — this is where raw access belongs.
      "src/api/**",
      "src/lib/supabase.{js,ts}",
      "src/lib/pagedQuery.ts",
      "**/__tests__/**",
      "**/*.test.{js,jsx,ts,tsx}",
      // Correctly paged via @/lib/pagedQuery — the raw call sits inside the
      // page(start, end) callback, which is the intended shape.
      "src/components/drawings/ExportFabReleaseModal.jsx",
      "src/lib/autoScheduleDetailing.js",
      // Already paged via a local allRows-style helper; fold them into
      // @/lib/pagedQuery when convenient.
      "src/lib/detailingValidation/repository.ts",
      "src/lib/crossSetSupersedeRepository.ts",
      // ── Verified bounded: single-row reads, writes, or an explicit limit ──
      // These were found by the AST selector, which catches multi-line calls
      // the grep behind this list originally missed. Each was read before being
      // listed; none can silently truncate.
      "src/services/permissions.ts",              // user_profiles role, .maybeSingle()
      "src/lib/AuthContext.tsx",                  // user_profiles role, .maybeSingle()
      "src/components/shared/numberSequencing.jsx", // number_sequences, .single()
      "src/pages/DrawingViewer.jsx",              // one drawing, .maybeSingle()
      "src/pages/drawingViewer/useDrawingViewerSelection.ts", // .maybeSingle()
      "src/components/changeorders/ChangeOrderImportModal.jsx", // .limit(1)
      "src/components/viewer3d/Model3DTab.jsx",   // .limit(1)
      "src/pages/projectMembers/useProjectMembersEditor.ts",    // .limit(20)
      "src/components/drawings/viewer/zonePanel/AddDependencyModal.jsx", // .limit(500)
      "src/lib/fabRelease/releaseStatus.ts",      // insert, not a read
      "src/lib/rfiFromDelta.js",                  // update, not a read
      // ── Genuinely unbounded. REAL FINDINGS, not false positives ───────────
      // Listed so this rule can land green; each still needs paging or a cap.
      // useDrawingRegister is the most exposed: `drawing_register_view` with no
      // limit now backs the Drawing Register tab, so a project past 1000 sheets
      // silently shows a short register.
      "src/hooks/useDrawingRegister.ts",
      "src/components/collaboration/CommentThread.jsx",
      "src/components/drawings/ExportMarkupPDFModal.jsx",
      "src/components/settings/SystemTab.jsx",
      "src/pages/Dashboard.jsx",
      "src/pages/ProductionStatus.jsx",
      "src/pages/Projects.jsx",
      // Grandfathered. SHRINK THIS LIST — verify each one is either bounded,
      // paged, or reads a single row, then remove it.
      "src/lib/drawingHub/**",
      "src/lib/revisionSnapshotDiff.js",
      "src/lib/importShippingTicket.js",
      "src/lib/importRfiLog.js",
      "src/components/deliveries/ShippingListImportModal.jsx",
      "src/components/drawings/viewer/useMarkup.js",
      "src/components/scope/BulkScopeModal.jsx",
      "src/services/ifcRosterImport.js",
      "src/hooks/useDrawingWatch.ts",
      "src/pages/Landing.jsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='supabase'][callee.property.name='from']",
          message:
            "Raw supabase.from() silently truncates at PostgREST's 1000-row cap. Use entities.* from @/api/supabaseClient, or fetchAllRows/fetchCapped from @/lib/pagedQuery.",
        },
      ],
    },
  },
];
