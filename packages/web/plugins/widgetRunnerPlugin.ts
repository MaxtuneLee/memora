import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { Plugin } from "vite";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNNER_PATH = "/widget-runner.html";
const TEMPLATE = new URL("../widget-runner.html", import.meta.url);
const ENTRY = new URL("../src/widgetRunner/runner.ts", import.meta.url);
const STYLES = [
  new URL("../src/styles/widgetBase.css", import.meta.url),
  new URL("../src/styles/svg.css", import.meta.url),
];

// Inside an inline <script> or <style>, a literal closing tag would end the element early.
const escapeForInlineTag = (source: string, tag: "script" | "style"): string =>
  source.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

const bundleRunnerScript = async (minify: boolean): Promise<string> => {
  const result = await build({
    configFile: false,
    root: WEB_ROOT,
    logLevel: "silent",
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    build: {
      write: false,
      minify,
      target: "es2022",
      lib: {
        entry: fileURLToPath(ENTRY),
        formats: ["iife"],
        name: "MemoraWidgetRunner",
        fileName: "widget-runner",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    if (!("output" in output)) continue;
    for (const chunk of output.output) {
      if (chunk.type === "chunk" && chunk.isEntry) return chunk.code;
    }
  }
  throw new Error("The widget runner bundle produced no entry chunk.");
};

const buildRunnerHtml = async (minify: boolean): Promise<string> => {
  const [template, script, ...styles] = await Promise.all([
    readFile(TEMPLATE, "utf8"),
    bundleRunnerScript(minify),
    ...STYLES.map((style) => readFile(style, "utf8")),
  ]);
  return template
    .replace("<!--widget-runner-styles-->", () =>
      styles.map((css) => `<style>${escapeForInlineTag(css, "style")}</style>`).join("\n"),
    )
    .replace(
      "<!--widget-runner-script-->",
      () => `<script>${escapeForInlineTag(script, "script")}</script>`,
    );
};

// Builds widget-runner.html: the static page generated widgets run in (ADR 0011). The page is one
// self-contained file with no module graph, so a sandboxed frame needs no CORS headers to load
// it, and the file can be copied to a different site as it is.
export const widgetRunnerPlugin = (): Plugin => {
  let cached: Promise<string> | undefined;
  return {
    name: "memora-widget-runner",
    configureServer(server) {
      server.watcher.on("change", () => {
        cached = undefined;
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.split(/[?#]/)[0] !== RUNNER_PATH) {
          next();
          return;
        }
        cached ??= buildRunnerHtml(false);
        cached.then(
          (html) => {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-cache");
            // The app page sets COEP: require-corp in dev, which a frame inside it must match.
            response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            response.end(html);
          },
          (error: unknown) => {
            cached = undefined;
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : "Widget runner build failed.");
          },
        );
      });
    },
    async generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: RUNNER_PATH.slice(1),
        source: await buildRunnerHtml(true),
      });
    },
  } satisfies Plugin;
};
