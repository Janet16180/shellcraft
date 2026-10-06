import js from '@eslint/js';
import globals from 'globals';

const CORE = ['src/shell/**/*.js', 'src/game/**/*.js', 'src/backend/**/*.js'];
const upward = (from, banned) => ({
  files: [from],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: banned.map(dir => ({ group: [`**/${dir}/**`, `**/${dir}/*.js`], message: `layers depend downward only: ${from} must not import ${dir}` })),
    }],
  },
});

export default [
  { ignores: ['node_modules/', '.scratch/', 'original/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    ignores: CORE,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    // The core runs under node --test and in the page alike: no DOM, storage or network.
    files: CORE,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { TextEncoder: 'readonly' } },
  },
  upward('src/backend/**/*.js', ['shell', 'game', 'map', 'ui', 'intro']),
  upward('src/shell/**/*.js', ['game', 'map', 'ui', 'intro']),
  upward('src/game/**/*.js', ['shell', 'map', 'ui', 'intro']),
  upward('src/map/**/*.js', ['shell', 'game', 'ui', 'intro']),
  {
    files: ['test/**/*.js', 'difftest/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-depth': ['warn', 3],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
