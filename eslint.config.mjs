import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'commitlint.config.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // Fastify's plugin/handler signatures often carry opts/request/reply params a given
      // implementation doesn't use — leading-underscore is the standard "intentionally
      // unused" convention, not a reason to disable the check entirely.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Empty `interface X {}` (options-for-future-extensibility) is a standard Fastify
      // plugin pattern — permit it for interfaces specifically, not for `type` aliases
      // (where the equivalent {} really would accept anything with no signal of intent).
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
    },
  }
);
