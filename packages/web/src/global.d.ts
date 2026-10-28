/// <reference lib="webworker" />
/// <reference types="./src/types/webcodecs.d.ts" />
/// <reference types="@webgpu/types" />
/// <reference types="@types/audioworklet" />
/// <reference types="vite-plugin-pwa/react" />

// Build-time values from vite.config.ts.
declare const __APP_VERSION__: string;
declare const __RELEASE_NOTE_ID__: string;
declare const __VENDOR_ASSETS__: {
  onnxRuntimeWeb: string;
  sqliteVec: string;
  vadWeb: string;
};

interface ImportMetaEnv {
  // Absolute URL of the widget runner page on a different site (ADR 0011). Unset or unreachable
  // means widgets run in the runner page served by the app itself.
  readonly VITE_WIDGET_SANDBOX_URL?: string;
}

interface WorkerOptions {
  extendedLifetime?: boolean;
}

declare module "pptx-react-viewer/styles";

declare module "sqlite-vec-wasm/dist/sqlite3-bundler-friendly.mjs" {
  interface SqliteVecInitOptions {
    locateFile?: (path: string) => string;
  }

  const sqlite3InitModule: (options?: SqliteVecInitOptions) => Promise<unknown>;
  export default sqlite3InitModule;
}
