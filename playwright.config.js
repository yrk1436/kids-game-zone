// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const iPhone17Pro = {
  ...devices['iPhone 13 Pro'],
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const teslaTouchscreen = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1920, height: 1200 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  timeout: 180000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iPhone 17 Pro Safari',
      use: iPhone17Pro,
    },
    {
      name: 'Tesla Touchscreen',
      use: teslaTouchscreen,
    },
    {
      name: 'iPhone 13 Safari',
      use: { ...devices['iPhone 13'], hasTouch: true },
    },
  ],
  webServer: {
    command: 'npx http-server -p 8080 -c-1',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 30000,
  },
});