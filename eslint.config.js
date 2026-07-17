import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'prisma/migrations/**'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['backend/src/**/*.ts'],
    rules: {
      // backend uses winston — raw console is not allowed
      'no-console': 'error',
      // Permission API: requirePermission(resource, action) — always 2 args.
      // Catches stale single-arg form `requirePermission('EMPLOYEE_CREATE')` from
      // pre-Batch-1 examples. See shared/src/permissions.ts for the real signature.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="requirePermission"][arguments.length<2]',
          message:
            'requirePermission requires 2 args: (resource, action). See shared/src/permissions.ts.',
        },
        {
          selector: 'CallExpression[callee.name="hasPermission"][arguments.length<3]',
          message:
            'hasPermission requires 3 args: (role, resource, action). See shared/src/permissions.ts.',
        },
      ],
    },
  }
);
