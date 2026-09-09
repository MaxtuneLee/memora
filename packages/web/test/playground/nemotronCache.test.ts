import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const testState = vi.hoisted(() => {
  const directories = new Set<string>();
  const fileBytesByPath = new Map<string, number>();

  const addParentDirs = (path: string) => {
    const segments = path.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments.slice(0, -1)) {
      current += `/${segment}`;
      directories.add(current);
    }
  };

  const dir = vi.fn((path: string) => ({
    path,
    exists: vi.fn(async () => directories.has(path)),
  }));

  const file = vi.fn((path: string) => ({
    path,
    exists: vi.fn(async () => fileBytesByPath.has(path)),
    getSize: vi.fn(async () => {
      const size = fileBytesByPath.get(path);
      if (size === undefined) throw new Error(`Missing file size for ${path}`);
      return size;
    }),
    remove: vi.fn(async () => {
      fileBytesByPath.delete(path);
    }),
  }));

  const write = vi.fn(async (path: string, data: string) => {
    addParentDirs(path);
    fileBytesByPath.set(path, new TextEncoder().encode(data).byteLength);
  });

  const writeStream = vi.fn(async (path: string, stream: ReadableStream<Uint8Array>) => {
    addParentDirs(path);
    const reader = stream.getReader();
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
    }
    fileBytesByPath.set(path, total);
  });

  const rm = vi.fn(async (path: string) => {
    for (const key of fileBytesByPath.keys()) {
      if (key === path || key.startsWith(`${path}/`)) fileBytesByPath.delete(key);
    }
    for (const key of directories) {
      if (key === path || key.startsWith(`${path}/`)) directories.delete(key);
    }
  });

  return { directories, fileBytesByPath, dir, file, write, writeStream, rm };
});

vi.mock("@memora/fs", () => ({
  dir: testState.dir,
  file: testState.file,
  write: testState.write,
  writeStream: testState.writeStream,
  rm: testState.rm,
}));

import {
  clearNemotronCache,
  downloadNemotronCache,
  getNemotronCacheStatus,
  getNemotronResourcePath,
  NEMOTRON_RESOURCE_NAMES,
} from "../../src/lib/playground/nemotron/cache";

const createFetchResource = () =>
  vi.fn(async (url: string) => {
    const name = url.split("/").at(-1) ?? "resource";
    return new Response(name, { status: 200, headers: { "Content-Length": String(name.length) } });
  });

describe("Nemotron cache", () => {
  beforeEach(() => {
    testState.directories.clear();
    testState.fileBytesByPath.clear();
    vi.clearAllMocks();
  });

  test("reports not cached when nothing has been downloaded", async () => {
    const status = await getNemotronCacheStatus();

    expect(status).toEqual({ cached: false, totalBytes: 0 });
  });

  test("downloads every resource and reports progress", async () => {
    const fetchResource = createFetchResource();
    const progress = vi.fn();

    await downloadNemotronCache({ fetchResource, onProgress: progress });

    expect(fetchResource).toHaveBeenCalledTimes(NEMOTRON_RESOURCE_NAMES.length);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ file: "encoder.onnx", cached: false }),
    );

    const status = await getNemotronCacheStatus();
    expect(status.cached).toBe(true);
    expect(status.totalBytes).toBeGreaterThan(0);
  });

  test("skips resources that are already fully cached", async () => {
    const fetchResource = createFetchResource();
    await downloadNemotronCache({ fetchResource });
    fetchResource.mockClear();

    const progress = vi.fn();
    await downloadNemotronCache({ fetchResource, onProgress: progress });

    expect(fetchResource).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ cached: true }));
  });

  test("clearing the cache removes every resource", async () => {
    await downloadNemotronCache({ fetchResource: createFetchResource() });
    expect((await getNemotronCacheStatus()).cached).toBe(true);

    await clearNemotronCache();

    const status = await getNemotronCacheStatus();
    expect(status).toEqual({ cached: false, totalBytes: 0 });
    expect(testState.fileBytesByPath.has(getNemotronResourcePath("encoder.onnx"))).toBe(false);
  });
});
