import { readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { routeBuilderPlugin } from "vite-plugin-route-builder";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";
// import { DevTools } from "@vitejs/devtools";
import path from "node:path";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const APP_VERSION =
  (
    JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as {
      version?: string;
    }
  ).version ?? "0.0.0";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    // DevTools(),
    tailwindcss(),
    routeBuilderPlugin({
      pagePattern: "./src/pages/**/*.{tsx,sync.tsx}",
      outputPath: "./src/generated-routes.ts",
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.wasm",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.mjs",
          dest: "./",
        },
      ],
    }),
    VitePWA({
      injectRegister: "auto",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
      ],
      manifest: {
        id: "/",
        name: "Memora",
        short_name: "Memora",
        description: "Local-first multimodal learning and memory workspace.",
        theme_color: "#09090b",
        background_color: "#09090b",
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com",
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
    port: 9001,
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
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  experimental: {
    // bundledDev: true,
  },
  // devtools: {
  //   enabled: true,
  // },
});
