import { existsSync } from "node:fs";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  test: {
    include: ["test/browser/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : undefined,
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
