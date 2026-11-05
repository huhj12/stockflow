import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', screenshot: 'on' },
  webServer: [
    {
      command: 'npm run start -w @stockflow/web',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
    },
    {
      command: 'npm run start -w @stockflow/api',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: false,
    },
  ],
});
