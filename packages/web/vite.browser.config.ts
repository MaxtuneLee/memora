import { existsSync } from "node:fs";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  plugins: [
    stylex.vite({ dev: false, runtimeInjection: true }),
    react(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
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
