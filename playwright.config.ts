import { defineConfig } from '@playwright/test';
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? '3000';
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '4000';
const webUrl = `http://localhost:${webPort}`;
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: webUrl, screenshot: 'on' },
  webServer: [
    {
      command: `npm run start -w @stockflow/web -- --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
    },
    {
      command: 'npm run start -w @stockflow/api',
      url: `http://localhost:${apiPort}/api/health`,
      env: { PORT: apiPort, WEB_ORIGIN: webUrl },
      reuseExistingServer: false,
    },
  ],
});
