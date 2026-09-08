import { existsSync } from "node:fs";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { parquetWriteBuffer } from "hyparquet-writer";
import { defineConfig } from "vite-plus";

const DATASET_ID = "fixture/speech";
const REVISION = "fixture-commit-sha";
const TEST_PATH = "parquet-data/hi_in/test-00000-of-00001.parquet";
const TRAIN_PATH = "parquet-data/hi_in/train-00000-of-00001.parquet";
const LARGE_AUDIO_BYTES = 200_000;

function createFixture(): Uint8Array {
  const audio = (marker: number) => {
    const bytes = new Uint8Array(LARGE_AUDIO_BYTES);
    const view = new DataView(bytes.buffer);
    const write = (offset: number, value: string) =>
      Array.from(value).forEach((character, index) =>
        view.setUint8(offset + index, character.charCodeAt(0)),
      );
    write(0, "RIFF");
    view.setUint32(4, bytes.byteLength - 8, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, 32_000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, bytes.byteLength - 44, true);
    view.setInt16(44, marker, true);
    return { bytes, path: `${marker}.wav` };
  };
  const features = {
    id: { dtype: "int32", _type: "Value" },
    transcription: { dtype: "string", _type: "Value" },
    lang_id: { names: ["Hindi", "English"], _type: "ClassLabel" },
    audio: { sampling_rate: 16_000, _type: "Audio" },
  };
  return new Uint8Array(
    parquetWriteBuffer({
      columnData: [
        { name: "id", data: [2, 1, 3] },
        { name: "transcription", data: ["second", "first", "third"] },
        { name: "lang_id", data: [0, 1, 0] },
        { name: "audio", data: [audio(2), audio(1), audio(3)] },
      ],
      schema: [
        { name: "schema", num_children: 4 },
        { name: "id", type: "INT32", repetition_type: "REQUIRED" },
        {
          name: "transcription",
          type: "BYTE_ARRAY",
          converted_type: "UTF8",
          repetition_type: "REQUIRED",
        },
        { name: "lang_id", type: "INT32", repetition_type: "REQUIRED" },
        { name: "audio", num_children: 2, repetition_type: "REQUIRED" },
        { name: "bytes", type: "BYTE_ARRAY", repetition_type: "REQUIRED" },
        {
          name: "path",
          type: "BYTE_ARRAY",
          converted_type: "UTF8",
          repetition_type: "REQUIRED",
        },
      ],
      codec: "UNCOMPRESSED",
      kvMetadata: [{ key: "huggingface", value: JSON.stringify({ info: { features } }) }],
    }),
  );
}

const fixture = createFixture();
const responseBytes = new Map<string, number>();

function sendJson(response: import("node:http").ServerResponse, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(body);
}

function sendParquet(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  pathname: string,
  slow = false,
): void {
  const range = request.headers.range;
  let start = 0;
  let end = fixture.byteLength - 1;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/u.exec(range);
    if (match) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    }
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${start}-${end}/${fixture.byteLength}`);
  }
  const body = fixture.slice(start, end + 1);
  responseBytes.set(pathname, (responseBytes.get(pathname) ?? 0) + body.byteLength);
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("content-length", body.byteLength);
  response.setHeader("content-type", "application/octet-stream");
  response.setHeader("etag", '"fixture-etag"');
  response.setHeader("x-linked-etag", '"fixture-etag"');
  if (!slow) {
    response.end(body);
    return;
  }
  const midpoint = Math.max(1, Math.floor(body.byteLength / 2));
  response.write(body.slice(0, midpoint));
  setTimeout(() => response.end(body.slice(midpoint)), 150);
}

function hubFixturePlugin() {
  return {
    name: "dataset-hub-fixture",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://fixture.test");
        if (url.pathname === "/__dataset_fixture/reset") {
          responseBytes.clear();
          sendJson(response, { ok: true });
          return;
        }
        if (url.pathname === "/__dataset_fixture/stats") {
          sendJson(response, Object.fromEntries(responseBytes));
          return;
        }
        if (url.pathname === `/hub/api/datasets/${DATASET_ID}/revision/main`) {
          sendJson(response, {
            _id: "fixture",
            id: DATASET_ID,
            private: false,
            downloads: 0,
            gated: false,
            likes: 0,
            lastModified: "2026-01-01T00:00:00.000Z",
            sha: REVISION,
            cardData: {
              configs: [
                {
                  config_name: "hi_in",
                  data_files: [
                    { split: "test", path: TEST_PATH },
                    { split: "train", path: TRAIN_PATH },
                  ],
                },
              ],
            },
          });
          return;
        }
        if (url.pathname === `/hub/api/datasets/${DATASET_ID}/tree/${REVISION}`) {
          sendJson(response, [
            { type: "file", path: TEST_PATH, size: fixture.byteLength, oid: "test-oid" },
            { type: "file", path: TRAIN_PATH, size: fixture.byteLength, oid: "train-oid" },
          ]);
          return;
        }
        const resolvePrefix = `/hub/datasets/${DATASET_ID}/resolve/${REVISION}/`;
        if (url.pathname.startsWith(resolvePrefix)) {
          sendParquet(
            request,
            response,
            decodeURIComponent(url.pathname.slice(resolvePrefix.length)),
          );
          return;
        }
        const slowResolvePrefix = `/hub-slow/datasets/${DATASET_ID}/resolve/${REVISION}/`;
        if (url.pathname.startsWith(slowResolvePrefix)) {
          sendParquet(
            request,
            response,
            decodeURIComponent(url.pathname.slice(slowResolvePrefix.length)),
            true,
          );
          return;
        }
        next();
      });
    },
  };
}

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  plugins: [hubFixturePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../web/src"),
      "@memora/datasets": path.resolve(import.meta.dirname, "src/index.ts"),
      "@memora/fs": path.resolve(import.meta.dirname, "../fs/src/index.ts"),
    },
  },
  server: {
    fs: { allow: [".."] },
  },
  test: {
    include: ["test/browser/**/*.browser.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : undefined,
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
