import { describe, expect, it } from "vitest";

import { extractLogMelFeatures } from "../src/index";

describe("extractLogMelFeatures", () => {
  it("rejects audio with a sample rate the model does not support", () => {
    expect(() =>
      extractLogMelFeatures({ pcm: new Float32Array(1_600), sampleRate: 8_000 }),
    ).toThrow("16000 Hz");
  });

  it("returns one centered frame per hop plus the initial frame", () => {
    const frames = extractLogMelFeatures({
      pcm: new Float32Array(16_000),
      sampleRate: 16_000,
    });

    expect(frames).toHaveLength(101);
    expect(frames.every((frame) => frame.length === 128)).toBe(true);
  });

  it("extracts a centered frame from a single sample", () => {
    const frames = extractLogMelFeatures({
      pcm: new Float32Array([0.5]),
      sampleRate: 16_000,
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].every(Number.isFinite)).toBe(true);
  });

  it("produces near-zero mel energy for silence", () => {
    const frames = extractLogMelFeatures({
      pcm: new Float32Array(1_600),
      sampleRate: 16_000,
    });

    for (const frame of frames) {
      expect(Math.max(...frame.map(Math.exp))).toBeLessThan(1e-8);
    }
  });

  it("concentrates a pure 1 kHz tone in its corresponding mel bins", () => {
    const pcm = Float32Array.from({ length: 3_200 }, (_, index) =>
      Math.sin((2 * Math.PI * 1_000 * index) / 16_000),
    );
    const frames = extractLogMelFeatures({ pcm, sampleRate: 16_000 });
    const energies = frames[10].map(Math.exp);
    const totalEnergy = energies.reduce((sum, energy) => sum + energy, 0);
    const nearbyEnergy = energies.slice(40, 45).reduce((sum, energy) => sum + energy, 0);
    const peakBin = energies.indexOf(Math.max(...energies));

    expect(peakBin).toBeGreaterThanOrEqual(40);
    expect(peakBin).toBeLessThanOrEqual(44);
    expect(nearbyEnergy / totalEnergy).toBeGreaterThan(0.9);
  });
});
