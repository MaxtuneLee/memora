import { expect, test } from "vite-plus/test";

import { hasWebAssembly, hasWebGpu } from "@/lib/device/browserSupport";

const gpuWith = (adapter: unknown) => ({ requestAdapter: async () => adapter });

test("treats WebGPU as missing when there is no GPU or no adapter", async () => {
  expect(await hasWebGpu(undefined)).toBe(false);
  expect(await hasWebGpu(gpuWith(null))).toBe(false);
  expect(await hasWebGpu(gpuWith({}))).toBe(true);
});

test("detects WebAssembly", () => {
  expect(hasWebAssembly()).toBe(true);
});
