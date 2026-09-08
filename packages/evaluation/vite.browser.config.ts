import { existsSync } from "node:fs";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  resolve: {
    alias: {
      "@memora/evaluation": path.resolve(import.meta.dirname, "src/index.ts"),
      "@memora/datasets": path.resolve(import.meta.dirname, "../datasets/src/index.ts"),
      "@memora/fs": path.resolve(import.meta.dirname, "../fs/src/index.ts"),
    },
  },
  server: {
    fs: { allow: [".."] },
  },
  test: {
    include: ["test/browser/**/*.browser.ts"],
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
