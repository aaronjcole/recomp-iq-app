import { chromium, defineConfig, devices } from "@playwright/test";
import { resolveChromiumExecutable } from "./scripts/resolve-chromium.mjs";

const deployedBaseURL = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const localBaseURL = "http://127.0.0.1:4173";

// CI installs the pinned browser, so this returns {} there. It only supplies an
// executablePath when that build is missing and another Chromium is available —
// which is what makes `npm run test:e2e` runnable in a sandboxed container.
// Wrapped end to end: a resolver problem must never be the reason a suite fails.
function chromiumLaunchOptions() {
  try {
    let expectedPath;
    try {
      expectedPath = chromium.executablePath();
    } catch {
      // No registry entry for this build; treat it as missing.
    }

    const executablePath = resolveChromiumExecutable({ expectedPath });
    if (!executablePath) return {};

    console.warn(
      `[playwright] pinned browser unavailable (expected ${expectedPath ?? "unknown"}, ` +
        `plus its headless shell); falling back to ${executablePath}. ` +
        `Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to override.`
    );
    return { executablePath };
  } catch (error) {
    console.warn(`[playwright] browser fallback skipped: ${error.message}`);
    return {};
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: deployedBaseURL || localBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions() },
    },
  ],
  webServer: deployedBaseURL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_BASE44_APP_ID: "playwright-local",
          VITE_BASE44_APP_BASE_URL: localBaseURL,
        },
      },
});
