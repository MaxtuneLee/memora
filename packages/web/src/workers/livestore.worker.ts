import { makeWorker } from "@livestore/adapter-web/worker";

import { schema } from "@/livestore/schema";

if (import.meta.env.DEV) {
  const diagnostics = new BroadcastChannel("memora-livestore-worker-diagnostics");
  self.addEventListener("error", (event) => {
    diagnostics.postMessage({
      type: "error",
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });
  self.addEventListener("unhandledrejection", (event) => {
    diagnostics.postMessage({
      type: "unhandledrejection",
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
    });
  });
}

makeWorker({
  schema,
});
