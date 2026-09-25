import { defineConfig } from '@playwright/test';

const PORT = 5090;

// End-to-end tests run the PRODUCTION build (API + built React app on one port, two cluster workers)
// against a dedicated database, exactly the way the app ships.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node server/dist/cluster.js',
    url: `http://127.0.0.1:${PORT}/api/ready`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      MONGO_URI: 'mongodb://127.0.0.1:27017/job_portal_e2e?replicaSet=rs0',
      JWT_SECRET: 'e2e-secret-that-is-long-enough-123456',
      WEB_CONCURRENCY: '2',
      LOG_LEVEL: 'error',
      RATE_LIMIT_PER_MIN: '1000000',
      AUTH_RATE_LIMIT: '1000000'
    }
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
