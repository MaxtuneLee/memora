const DEFAULT_MOUNT_PATH = "/_livestore";
const PLUGIN_NAME = "@memora/livestore-devtool/vite";

export interface LiveStoreDevtoolsPluginOptions {
  setupModulePath: string;
  path?: string;
  title?: string;
  currentPath?: string;
  storagePath?: string;
  pollIntervalMs?: number;
  maxRows?: number;
}

const normalizeMountPath = (path: string | undefined): string => {
  const value = path?.trim() || DEFAULT_MOUNT_PATH;
  return value.startsWith("/") ? value : `/${value}`;
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const serializeOptions = (options: LiveStoreDevtoolsPluginOptions): string => {
  return JSON.stringify({
    title: options.title,
    currentPath: options.currentPath,
    storagePath: options.storagePath,
    pollIntervalMs: options.pollIntervalMs,
    maxRows: options.maxRows,
  });
};

export function livestoreDevtoolsPlugin(options: LiveStoreDevtoolsPluginOptions) {
  const mountPath = normalizeMountPath(options.path);

  return {
    name: PLUGIN_NAME,
    apply: "serve",
    configureServer(server: {
      middlewares: {
        use: (handler: (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }, next: () => void) => void | Promise<void>) => void;
      };
      transformIndexHtml: (url: string, html: string) => Promise<string>;
    }) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const requestUrl = new URL(req.url, "http://localhost");
        const pathname = requestUrl.pathname.replace(/\/$/, "") || "/";
        if (pathname !== mountPath) {
          next();
          return;
        }

        const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(options.title ?? "LiveStore Devtools")}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import { renderLiveStoreDevtools } from ${JSON.stringify(options.setupModulePath)};

      const root = document.getElementById("root");
      if (!(root instanceof HTMLElement)) {
        throw new Error("Missing #root container for LiveStore devtools.");
      }

      renderLiveStoreDevtools(root, ${serializeOptions(options)});
    </script>
  </body>
</html>`;

        const transformedHtml = await server.transformIndexHtml(req.url, html);
        res.setHeader("Content-Type", "text/html");
        res.end(transformedHtml);
      });
    },
  };
}
