/// <reference types="./src/types/webcodecs.d.ts" />
/// <reference types="@webgpu/types" />
/// <reference types="@types/audioworklet" />

declare const __APP_VERSION__: string;

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
