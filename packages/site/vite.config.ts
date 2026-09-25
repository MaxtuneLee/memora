import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = "https://memora.xox.im";

// sitemap.xml, built from the site's routes plus every docs page in src/pages/docs/content.tsx,
// so new docs pages are listed without editing it by hand.
function sitemap(): Plugin {
  return {
    name: "memora-sitemap",
    apply: "build",
    generateBundle() {
      const docs = readFileSync(path.resolve(siteDir, "src/pages/docs/content.tsx"), "utf8");
      const slugs = [...docs.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
      const paths = [
        "/",
        "/pricing",
        "/sync",
        "/docs",
        ...slugs.filter((s) => s !== "overview").map((s) => `/docs/${s}`),
      ];
      const urls = paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}
const webSrc = path.resolve(siteDir, "../web/src");

// The site renders real @memora/web components with mock data. Those components are
// compiled straight from web's source, so this mirrors web's StyleX and React setup.
export default defineConfig({
  plugins: [
    stylex.vite({
      dev: process.env.NODE_ENV === "development",
      runtimeInjection: false,
      cssInjectionTarget: (fileName: string) => /(^|\/)index(-[\w]+)?\.css$/.test(fileName),
      unstable_moduleResolution: {
        rootDir: path.resolve(siteDir, ".."),
        type: "commonJS",
      },
      useCSSLayers: false,
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    sitemap(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-router", "@dnd-kit/core", "motion"],
    alias: [
      // The real store boots LiveStore on OPFS at import time; the site never needs it.
      {
        find: /^@\/livestore\/store$/,
        replacement: path.resolve(siteDir, "src/stubs/livestoreStore.ts"),
      },
      { find: /^@web\//, replacement: `${webSrc}/` },
      { find: /^@\//, replacement: `${webSrc}/` },
    ],
  },
  server: {
    port: 9004,
    fs: {
      allow: [path.resolve(siteDir, "..")],
    },
  },
  build: {
    target: "esnext",
  },
});
