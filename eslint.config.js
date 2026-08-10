import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import spacingPlugin from './eslint-plugin-spacing/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'public/static/charting_library/**',
      'mock-data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  // Node.js files (scripts, config files)
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
      },
      // Same tsconfigRootDir pin as the TS block below — needed because
      // typescript-eslint also parses our `.js` config files and would
      // otherwise see the parent's `tsconfig.json` as an ambiguous root.
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Browser files (service workers, public scripts)
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },
  // TypeScript/React files
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      spacing: spacingPlugin,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // Pin tsconfigRootDir to this config's directory so the parser
      // doesn't get confused when both the parent (cloud) and this
      // submodule are present in the workspace.
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-unused-expressions': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-duplicate-imports': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      // Custom spacing rules
      'spacing/no-hardcoded-font-size': 'warn',
      'spacing/no-unknown-spacing-token': 'error',
      // Every recharts series must set isAnimationActive explicitly (default
      // false) — mid-animation unmount crashes React #185. See the rule doc
      // and core/src/components/trades/TradeCard.tsx.
      'spacing/recharts-explicit-animation': 'error',
    },
  }
);
