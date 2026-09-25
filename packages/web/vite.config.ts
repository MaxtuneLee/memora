import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import { routeBuilderPlugin } from "vite-plugin-route-builder";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { configDefaults } from "vitest/config";
import { livestoreDevtoolsPlugin } from "../livestore-devtool/src/vite";
import { voidPlugin } from "void";
import path from "node:path";

import { parseReleaseNotes } from "./src/lib/app/releaseNotes";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const readGitVersion = (): string => {
  try {
    return execSync("git describe --always --dirty", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};
// The short commit hash of the build, with -dirty when tracked files had uncommitted changes.
const APP_VERSION = readGitVersion();
const RELEASE_NOTES = parseReleaseNotes(
  readFileSync(new URL("./RELEASE_NOTES.md", import.meta.url), "utf8"),
);
const packageVersion = (name: string): string =>
  (
    JSON.parse(
      readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), "utf8"),
    ) as { version: string }
  ).version;
// Third-party runtime files are served from fixed, unhashed names and cached CacheFirst by the
// service worker, so each gets a directory per package version: an upgrade changes the URL.
const VENDOR_ASSETS = {
  onnxRuntimeWeb: `vendor/onnxruntime-web@${packageVersion("onnxruntime-web")}`,
  sqliteVec: `vendor/sqlite-vec-wasm@${packageVersion("sqlite-vec-wasm")}`,
  vadWeb: `vendor/vad-web@${packageVersion("@ricky0123/vad-web")}`,
};
const isVitest = process.env.VITEST === "true" || process.env.VITEST === "1";
const nanoBeirProxy = {
  target: "https://datasets-server.huggingface.co",
  changeOrigin: true,
  rewrite: (requestPath: string) => requestPath.replace(/^\/api\/playground\/nanobeir/u, "/rows"),
};

const config = {
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __RELEASE_NOTE_ID__: JSON.stringify(RELEASE_NOTES[0]?.id ?? ""),
    __VENDOR_ASSETS__: JSON.stringify(
      Object.fromEntries(Object.entries(VENDOR_ASSETS).map(([key, dir]) => [key, `/${dir}/`])),
    ),
  },
  plugins: [
    voidPlugin(),
    ...(isVitest
      ? []
      : [
          livestoreDevtoolsPlugin({
            setupModulePath: "/src/devtools/livestoreDevtoolsSetup.tsx",
            path: "/_db",
            title: "Memora DB Devtools",
          }),
        ]),
    routeBuilderPlugin({
      pagePattern: "./src/pages/**/*.{tsx,sync.tsx}",
      outputPath: "./src/generated-routes.ts",
    }),
    stylex.vite({
      dev: process.env.NODE_ENV === "development",
      runtimeInjection: false,
      // The plugin's default target picker only matches unhashed "index.css"/
      // "style.css" filenames, so it never matches Vite's hashed output and
      // silently falls back to the first CSS asset in the bundle - which isn't
      // necessarily the stylesheet every page loads. Match the hashed entry
      // stylesheet explicitly instead.
      cssInjectionTarget: (fileName: string) => /(^|\/)index(-[\w]+)?\.css$/.test(fileName),
      unstable_moduleResolution: {
        rootDir: path.dirname(fileURLToPath(import.meta.url)),
        type: "commonJS",
      },
      // Cross-stylesheet @layer order is load-order dependent: in dev,
      // StyleX's own stylesheet loads before index.css and locks in
      // `priority1..10` first, so index.css's later `@layer reset, priority1,
      // ...` declaration can only append `reset` at the end (highest
      // priority) - the global reset then wins over StyleX everywhere in dev.
      // Unlayered output sidesteps this: StyleX's class selectors (0,1,0)
      // beat the reset's unlayered element selectors (0,0,1) on plain
      // specificity, independent of stylesheet load order.
      useCSSLayers: false,
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    ...(isVitest
      ? []
      : [
          viteStaticCopy({
            targets: [
              {
                src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
                dest: VENDOR_ASSETS.vadWeb,
              },
              {
                src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
                dest: VENDOR_ASSETS.vadWeb,
              },
              {
                src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
                dest: VENDOR_ASSETS.vadWeb,
              },
              {
                src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
                dest: VENDOR_ASSETS.onnxRuntimeWeb,
              },
              {
                src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
                dest: VENDOR_ASSETS.onnxRuntimeWeb,
              },
              {
                src: "node_modules/sqlite-vec-wasm/dist/sqlite3.wasm",
                dest: VENDOR_ASSETS.sqliteVec,
              },
            ],
          }),
        ]),
    {
      // The update dialog fetches this from the network to show what the new build changes.
      name: "memora-release-notes",
      apply: "build",
      generateBundle() {
        if (this.environment.name !== "client") return;
        this.emitFile({
          type: "asset",
          fileName: "release-notes.json",
          source: JSON.stringify({ version: APP_VERSION, notes: RELEASE_NOTES }),
        });
      },
    } satisfies Plugin,
    VitePWA({
      // Registered by src/lib/app/serviceWorkerUpdates.ts, which asks before activating an update.
      injectRegister: false,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        id: "/",
        name: "Memora",
        short_name: "Memora",
        description: "Local-first multimodal learning and memory workspace.",
        // Manifest colors are static; they match the light default and runtime metadata
        // follows the resolved theme.
        theme_color: "#fcfaf6",
        background_color: "#fcfaf6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "en",
        categories: ["education", "productivity", "utilities"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // The local image OCR pipeline ships a lazily-loaded worker just over 10 MB.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-font-stylesheets",
            },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-font-webfonts",
              expiration: {
                maxAgeSeconds: THIRTY_DAYS_IN_SECONDS,
                maxEntries: 8,
              },
            },
          },
          {
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin && /\.(?:mjs|wasm|onnx)$/i.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "memora-ai-assets",
              expiration: {
                maxAgeSeconds: THIRTY_DAYS_IN_SECONDS,
                maxEntries: 32,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 9003,
    proxy: {
      "/api/playground/nanobeir": nanoBeirProxy,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: ["..", "../../"],
    },
  },
  optimizeDeps: {
    ignoreOutdatedRequests: true,
    include: [
      "@react-grab/mcp/client",
      "@huggingface/transformers",
      "react-grab",
      "sqlite-vec-wasm/dist/sqlite3-bundler-friendly.mjs",
    ],
  },
  preview: {
    proxy: {
      "/api/playground/nanobeir": nanoBeirProxy,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
    // minify: false,
    // sourcemap: true,
    rolldownOptions: {
      // devtools: {},
      experimental: {
        lazyBarrel: true,
      },
    },
  },
  worker: {
    format: "es",
  },
  resolve: {
    // Keep React and its renderer on the same module instance in the pnpm workspace.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@memora/livestore-devtool": path.resolve(__dirname, "../livestore-devtool/src/index.ts"),
      ai: path.resolve(__dirname, "./src/lib/pptxAiShim.ts"),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["test/editor/**/*.test.tsx", "jsdom"]],
    exclude: [...configDefaults.exclude, "test/browser/**"],
    setupFiles: "./test/setup.ts",
  },
  experimental: {
    // bundledDev: true,
  },
  // devtools: {
  //   enabled: true,
  // },
};

export default defineConfig(config as any);
