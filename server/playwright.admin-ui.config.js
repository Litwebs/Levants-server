const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e/admin-ui', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4174', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm --prefix ../client run build && node e2e/deals/serve-admin.js', url: 'http://127.0.0.1:4174', timeout: 120000 },
});
