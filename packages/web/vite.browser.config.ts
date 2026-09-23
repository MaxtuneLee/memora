import { existsSync } from "node:fs";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Emulates operating system media features, so System theme tests can flip the color scheme at
// runtime and visual references can turn off decorative motion.
const emulateMedia: BrowserCommand<
  [media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" | "no-preference" }]
> = async (context, media) => {
  if (context.provider.name !== "playwright") throw new Error("Needs the Playwright provider");
  await context.page.emulateMedia(media);
};

export default defineConfig({
  plugins: [stylex.vite({ dev: false, runtimeInjection: true }), react()],
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
      commands: { emulateMedia },
      // References live next to the tests and are committed; __screenshots__ holds only
      // gitignored failure captures.
      expect: {
        toMatchScreenshot: {
          // Tolerates antialiasing noise; a color or layout regression moves far more pixels.
          comparatorName: "pixelmatch",
          comparatorOptions: { allowedMismatchedPixelRatio: 0.002 },
          resolveScreenshotPath: ({
            arg,
            browserName,
            ext,
            platform,
            root,
            testFileDirectory,
            testFileName,
          }) =>
            `${root}/${testFileDirectory}/__visual__/${testFileName}/${arg}-${browserName}-${platform}${ext}`,
        },
      },
    },
  },
});
