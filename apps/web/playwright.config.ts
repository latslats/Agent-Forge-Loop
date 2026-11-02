import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const url = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  // Kept under node_modules (gitignored) so run output stays out of git and Biome.
  outputDir: `${repoRoot}node_modules/.cache/playwright`,
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: repoRoot,
    url,
    reuseExistingServer: true,
  },
})
