import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const testState = vi.hoisted(() => {
  const directories = new Set<string>();
  const fileBytesByPath = new Map<string, number>();
  const fileTextByPath = new Map<string, string>();

  const normalizePath = (input: string): string => {
    if (!input) return "/";
    const prefixed = input.startsWith("/") ? input : `/${input}`;
    return prefixed.length > 1 && prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
  };

  const dir = vi.fn((path: string) => {
    const normalized = normalizePath(path);
    return {
      path: normalized,
      exists: vi.fn(async () => directories.has(normalized)),
    };
  });

  const file = vi.fn((path: string) => {
    const normalized = normalizePath(path);
    return {
      path: normalized,
      exists: vi.fn(async () => fileBytesByPath.has(normalized) || fileTextByPath.has(normalized)),
      text: vi.fn(async () => {
        const text = fileTextByPath.get(normalized);
        if (text === undefined) {
          throw new Error(`Missing file content for ${normalized}`);
        }
        return text;
      }),
      getSize: vi.fn(async () => {
        const size = fileBytesByPath.get(normalized);
        if (size === undefined) {
          throw new Error(`Missing file size for ${normalized}`);
        }
        return size;
      }),
      remove: vi.fn(async () => {
        fileBytesByPath.delete(normalized);
        fileTextByPath.delete(normalized);
      }),
    };
  });

  const ls = vi.fn(async (path: string, options?: { includeFiles?: boolean; includeDirs?: boolean }) => {
    const normalized = normalizePath(path);
    const includeFiles = options?.includeFiles ?? true;
    if (!includeFiles) return [];
    return [...fileBytesByPath.keys(), ...fileTextByPath.keys()]
      .filter((entry) => entry.startsWith(`${normalized}/`))
      .sort();
  });

  const write = vi.fn(async (path: string, data: string | ArrayBuffer, _options?: { overwrite?: boolean }) => {
    const normalized = normalizePath(path);
    const parent = normalized.slice(0, normalized.lastIndexOf("/")) || "/";
    directories.add(parent);
    if (typeof data === "string") {
      fileTextByPath.set(normalized, data);
      fileBytesByPath.set(normalized, new TextEncoder().encode(data).byteLength);
      return;
    }
    fileBytesByPath.set(normalized, data.byteLength);
  });

  return {
    dir,
    directories,
    file,
    fileBytesByPath,
    fileTextByPath,
    ls,
    normalizePath,
    write,
  };
});

vi.mock("@memora/fs", () => ({
  dir: testState.dir,
  file: testState.file,
  ls: testState.ls,
  write: testState.write,
}));

import {
  getLocalModelCacheStatus,
  writeLocalModelCacheMarker,
} from "../../src/lib/local-model/status";

const GEMMA_CACHE_PATH = "/transformers-cache/onnx-community/gemma-4-E2B-it-ONNX";
const CACHE_MARKER_PATH = `${GEMMA_CACHE_PATH}/.memora-cache-state.json`;

describe("local model cache status", () => {
  beforeEach(() => {
    testState.directories.clear();
    testState.fileBytesByPath.clear();
    testState.fileTextByPath.clear();
    testState.dir.mockClear();
    testState.file.mockClear();
    testState.ls.mockClear();
    testState.write.mockClear();
  });

  test("does not treat partial cache files as downloaded without a completion marker", async () => {
    testState.directories.add(GEMMA_CACHE_PATH);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/config.json`, 128);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/onnx/model.onnx_data`, 2048);

    const status = await getLocalModelCacheStatus("gemma-4-e2b-it-onnx");

    expect(status.cached).toBe(false);
    expect(status.fileCount).toBe(2);
  });

  test("treats cache as downloaded when marker and expected files are complete", async () => {
    testState.directories.add(GEMMA_CACHE_PATH);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/config.json`, 128);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/onnx/model.onnx_data`, 2048);

    await writeLocalModelCacheMarker("gemma-4-e2b-it-onnx");

    const status = await getLocalModelCacheStatus("gemma-4-e2b-it-onnx");

    expect(status.cached).toBe(true);
    expect(status.fileCount).toBe(2);
    expect(status.totalBytes).toBe(2176);
    expect(testState.fileTextByPath.get(CACHE_MARKER_PATH)).toContain("config.json");
  });

  test("invalidates the cache marker when an expected file goes missing", async () => {
    testState.directories.add(GEMMA_CACHE_PATH);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/config.json`, 128);
    testState.fileBytesByPath.set(`${GEMMA_CACHE_PATH}/onnx/model.onnx_data`, 2048);

    await writeLocalModelCacheMarker("gemma-4-e2b-it-onnx");
    testState.fileBytesByPath.delete(`${GEMMA_CACHE_PATH}/onnx/model.onnx_data`);

    const status = await getLocalModelCacheStatus("gemma-4-e2b-it-onnx");

    expect(status.cached).toBe(false);
    expect(status.fileCount).toBe(1);
  });
});
