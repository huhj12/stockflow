import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/src/**/*.spec.ts', 'apps/web/src/**/*.spec.ts'],
    environment: 'node',
  },
});
