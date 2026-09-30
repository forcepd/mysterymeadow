import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The simulation and content data must stay pure: no rendering, UI, or browser APIs.
    // (tsconfig.sim.json also omits the DOM lib, so DOM globals fail the typecheck.)
    files: ['src/sim/**/*.ts', 'src/config/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'src/sim must not import Phaser.' },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'src/sim must not import React.',
            },
            {
              group: ['**/game/**', '**/ui/**', '**/dev/**', '**/save/**'],
              message: 'src/sim must not import app layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.{js,mjs,ts}', 'scripts/**', 'tests/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
