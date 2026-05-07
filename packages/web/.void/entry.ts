import app, { scheduled, __voidCollectPrerenderPaths, __voidHandleWebSocket, __withRawEnv } from 'virtual:void-routes';
import { withRuntimeEnv } from "/Users/maxtune/workspace/personal/memora/node_modules/.pnpm/@void-sdk+void@0.6.1_@opentelemetry+api@1.9.0_@void-sdk+md@0.6.1_@voidzero-dev+vite-plu_482181fd3cd7042cbd9e91790cc97627/node_modules/@void-sdk/void/dist/runtime/env.mjs";

function __filterInternalBindings(env) {
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && (prop.startsWith("__VOID_") || prop.startsWith("__PROJECT_"))) return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === "string" && (prop.startsWith("__VOID_") || prop.startsWith("__PROJECT_"))) return false;
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter(
        (key) => typeof key !== "string" || (!key.startsWith("__VOID_") && !key.startsWith("__PROJECT_"))
      );
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && (prop.startsWith("__VOID_") || prop.startsWith("__PROJECT_"))) return undefined;
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

async function serveWithAssets(request, env, response) {
  if (response.status !== 404 || !env.ASSETS || (request.method !== "GET" && request.method !== "HEAD")) return response;
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: request.method, headers: request.headers }));
  if (asset.status !== 404) {
    const res = new Response(asset.body, asset);
    if (new URL(request.url).pathname.startsWith("/assets/")) {
      res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.headers.set("Cache-Control", "no-store");
    }
    return res;
  }
  return response;
}

async function __handleInternal(request, env, ctx) {
  const url = new URL(request.url);
  // Readiness probe — platform polls this to confirm the worker is live after WfP upload.
  // Handled here (before app.fetch) so user middleware cannot block it.
  if (request.method === "GET" && url.pathname === "/__void/ready") {
    return Response.json({ ready: true });
  }
  if (request.method !== "POST" || url.pathname !== "/__void/prerender-paths") return null;
  const __expected = env.__VOID_PROXY_TOKEN;
  if (__expected) {
    const __token = request.headers.get("x-void-internal");
    if (!__token || __token !== __expected) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const paths = await __voidCollectPrerenderPaths(request, env, ctx);
  return Response.json({ paths });
}
async function handleScheduled(controller, env, ctx) {
  const userEnv = __filterInternalBindings(env);
  return withRuntimeEnv(env, () => scheduled(controller, userEnv, ctx));
}


export default { fetch: async (request, env, ctx) => {
  const ws = await __voidHandleWebSocket(request, env);
  if (ws) return ws;
  return __withRawEnv(env, () => {
    const userEnv = __filterInternalBindings(env);
    return withRuntimeEnv(env, async () => {
      const internal = await __handleInternal(request, env, ctx);
      if (internal) return internal;
      return serveWithAssets(request, env, await app.fetch(request, userEnv, ctx));
    });
  });
}, scheduled: handleScheduled };