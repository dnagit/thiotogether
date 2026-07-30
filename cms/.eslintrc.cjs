module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    // `ignoreRestSiblings` allows the omit-by-destructuring idiom this codebase uses
    // to strip fields from a response: `const { secret, ...rest } = row`.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'vue/multi-word-component-names': 'off',
  },
  ignorePatterns: ['dist', 'node_modules', '*.d.ts'],
};
