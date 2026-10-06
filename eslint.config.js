import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.scratch/', 'original/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['src/shell/**/*.js', 'src/game/**/*.js', 'src/backend/**/*.js'],
    languageOptions: { globals: {} },
    rules: { 'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'navigator', 'requestAnimationFrame'] },
  },
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
