import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';
export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/.next/**',
    '.tools/**',
    '.npm-cache/**',
    '**/next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
  })),
  { settings: { next: { rootDir: 'apps/web/' } } },
  prettier,
]);
