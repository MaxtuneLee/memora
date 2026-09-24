// Smallest valid WebAssembly module: the "\0asm" magic number plus version 1.
const EMPTY_WASM_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

export const hasWebAssembly = (): boolean => {
  try {
    return typeof WebAssembly === "object" && WebAssembly.validate(EMPTY_WASM_MODULE);
  } catch {
    return false;
  }
};

interface GpuLike {
  requestAdapter(): Promise<unknown>;
}

// navigator.gpu can exist while no adapter is available (blocklisted GPU, disabled flag).
export const hasWebGpu = async (gpu: GpuLike | undefined = navigator.gpu): Promise<boolean> => {
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
};
