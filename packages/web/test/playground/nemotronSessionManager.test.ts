import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createNemotronSessionManager,
  NEMOTRON_CACHE_ROOT,
  NEMOTRON_MODEL_REVISION,
  type NemotronSessionManagerDependencies,
} from "@/lib/playground/nemotron/sessionManager";

const createFile = (name: string, contents: BlobPart = name) =>
  new File([contents], name, { type: "application/octet-stream" });

const createDependencies = () => {
  const cached = new Map<string, File>();
  const fetchResource = vi.fn(async (url: string) => {
    const name = url.split("/").at(-1) ?? "resource";
    return new Response(name, {
      status: 200,
      headers: { "Content-Length": String(name.length) },
    });
  });
  const createSession: NemotronSessionManagerDependencies["createSession"] = vi.fn(
    async () => ({}) as Awaited<ReturnType<NemotronSessionManagerDependencies["createSession"]>>,
  );
  const dependencies: NemotronSessionManagerDependencies = {
    fetchResource,
    readCachedFile: async (path) => cached.get(path),
    writeCachedFile: async (path, response, onProgress) => {
      const body = new Uint8Array(await response.arrayBuffer());
      onProgress?.({ loaded: body.byteLength, total: body.byteLength });
      const file = createFile(path.split("/").at(-1) ?? "resource", body);
      cached.set(path, file);
      return file;
    },
    createSession,
    hasWebGpu: () => true,
  };
  return { cached, createSession, dependencies, fetchResource };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Nemotron session manager", () => {
  test("downloads the model resources into its OPFS cache and reports progress", async () => {
    const { cached, dependencies, fetchResource } = createDependencies();
    const progress = vi.fn();
    const manager = createNemotronSessionManager(dependencies);

    const loaded = await manager.load({ onProgress: progress });

    expect(fetchResource).toHaveBeenCalledTimes(7);
    expect([...cached.keys()]).toEqual([
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/encoder.onnx`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/encoder.onnx.data`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/decoder.onnx`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/decoder.onnx.data`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/joint.onnx`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/joint.onnx.data`,
      `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/vocab.txt`,
    ]);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ file: "encoder.onnx", cached: false, loaded: 12, total: 12 }),
    );
    expect(loaded.vocabulary).toEqual(["vocab.txt"]);
  });

  test("reuses the completed load without reading the network again", async () => {
    const { dependencies, fetchResource } = createDependencies();
    const manager = createNemotronSessionManager(dependencies);

    const first = await manager.load();
    const second = await manager.load();

    expect(second).toBe(first);
    expect(fetchResource).toHaveBeenCalledTimes(7);
  });

  test("a new manager loads the cached OPFS files without downloading again", async () => {
    const { dependencies, fetchResource } = createDependencies();

    await createNemotronSessionManager(dependencies).load();
    await createNemotronSessionManager(dependencies).load();

    expect(fetchResource).toHaveBeenCalledTimes(7);
  });

  test("uses WebGPU for the encoder and wasm for decoder and joint", async () => {
    const { createSession, dependencies } = createDependencies();
    const manager = createNemotronSessionManager(dependencies);

    const loaded = await manager.load();

    expect(loaded.encoderDevice).toBe("webgpu");
    expect(vi.mocked(createSession).mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({
        executionProviders: ["webgpu"],
        externalData: [{ path: "encoder.onnx.data", data: expect.any(File) }],
      }),
      expect.objectContaining({
        executionProviders: ["wasm"],
        externalData: [{ path: "decoder.onnx.data", data: expect.any(File) }],
      }),
      expect.objectContaining({
        executionProviders: ["wasm"],
        externalData: [{ path: "joint.onnx.data", data: expect.any(File) }],
      }),
    ]);
  });

  test("uses wasm for the encoder when WebGPU is unavailable", async () => {
    const { createSession, dependencies } = createDependencies();
    dependencies.hasWebGpu = () => false;

    const loaded = await createNemotronSessionManager(dependencies).load();

    expect(loaded.encoderDevice).toBe("wasm");
    expect(vi.mocked(createSession).mock.calls[0]?.[1].executionProviders).toEqual(["wasm"]);
  });

  test("retries the encoder on wasm when WebGPU session creation fails", async () => {
    const { createSession, dependencies } = createDependencies();
    vi.mocked(createSession).mockRejectedValueOnce(new Error("WebGPU adapter failed"));

    const loaded = await createNemotronSessionManager(dependencies).load();

    expect(loaded.encoderDevice).toBe("wasm");
    expect(
      vi
        .mocked(createSession)
        .mock.calls.slice(0, 2)
        .map(([, options]) => options.executionProviders),
    ).toEqual([["webgpu"], ["wasm"]]);
  });
});
