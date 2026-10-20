import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

const files = ['src/**/*.ts', 'src/**/*.cts', 'preview-src/**/*.ts']
export default defineConfig(
  {
    ignores: [
      'src/compat/**',
      'preview-src/source-reference/**',
      'src/types/mascotPack.d.ts',
      '.build/**',
      'node_modules/**',
      'dist/**',
      'qa/**',
    ],
  },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files })),
  {
    files,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.renderer.json', './tsconfig.preview.json'],
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
)
