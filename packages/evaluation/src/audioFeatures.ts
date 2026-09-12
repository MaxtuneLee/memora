import type { DecodedWav } from "./wav";

const SAMPLE_RATE = 16_000;
const FFT_SIZE = 512;
const HOP_LENGTH = 160;
const WINDOW_LENGTH = 400;
const PREEMPHASIS = 0.97;
const LOG_ZERO_GUARD = 1e-10;
const MEL_BIN_COUNT = 128;
const FFT_BIN_COUNT = FFT_SIZE / 2 + 1;
const MEL_LINEAR_SCALE = 200 / 3;
const MEL_LOGARITHMIC_BOUNDARY = 1_000;
const MEL_BOUNDARY_VALUE = MEL_LOGARITHMIC_BOUNDARY / MEL_LINEAR_SCALE;
const MEL_LOGARITHMIC_STEP = Math.log(6.4) / 27;

function hzToMel(frequency: number): number {
  if (frequency < MEL_LOGARITHMIC_BOUNDARY) return frequency / MEL_LINEAR_SCALE;
  return MEL_BOUNDARY_VALUE + Math.log(frequency / MEL_LOGARITHMIC_BOUNDARY) / MEL_LOGARITHMIC_STEP;
}

function melToHz(mel: number): number {
  if (mel < MEL_BOUNDARY_VALUE) return mel * MEL_LINEAR_SCALE;
  return MEL_LOGARITHMIC_BOUNDARY * Math.exp(MEL_LOGARITHMIC_STEP * (mel - MEL_BOUNDARY_VALUE));
}

function createMelFilterbank(): Float32Array[] {
  const highestMel = hzToMel(SAMPLE_RATE / 2);
  const points = Float32Array.from({ length: MEL_BIN_COUNT + 2 }, (_, index) =>
    melToHz((highestMel * index) / (MEL_BIN_COUNT + 1)),
  );

  return Array.from({ length: MEL_BIN_COUNT }, (_, melIndex) => {
    const filter = new Float32Array(FFT_BIN_COUNT);
    const lower = points[melIndex];
    const center = points[melIndex + 1];
    const upper = points[melIndex + 2];
    const normalization = 2 / (upper - lower);
    for (let fftIndex = 0; fftIndex < FFT_BIN_COUNT; fftIndex += 1) {
      const frequency = (fftIndex * SAMPLE_RATE) / FFT_SIZE;
      const rising = (frequency - lower) / (center - lower);
      const falling = (upper - frequency) / (upper - center);
      filter[fftIndex] = Math.max(0, Math.min(rising, falling)) * normalization;
    }
    return filter;
  });
}

function createWindow(): Float32Array {
  const window = new Float32Array(FFT_SIZE);
  const offset = (FFT_SIZE - WINDOW_LENGTH) / 2;
  for (let index = 0; index < WINDOW_LENGTH; index += 1) {
    window[offset + index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / WINDOW_LENGTH);
  }
  return window;
}

function fft(real: Float32Array, imaginary: Float32Array): void {
  for (let index = 1, reversed = 0; index < FFT_SIZE; index += 1) {
    let bit = FFT_SIZE / 2;
    while (reversed & bit) {
      reversed ^= bit;
      bit /= 2;
    }
    reversed ^= bit;
    if (index >= reversed) continue;
    [real[index], real[reversed]] = [real[reversed], real[index]];
    [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
  }

  for (let width = 2; width <= FFT_SIZE; width *= 2) {
    const halfWidth = width / 2;
    const angle = (-2 * Math.PI) / width;
    for (let start = 0; start < FFT_SIZE; start += width) {
      for (let offset = 0; offset < halfWidth; offset += 1) {
        const cosine = Math.cos(angle * offset);
        const sine = Math.sin(angle * offset);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfWidth;
        const oddReal = real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary = real[oddIndex] * sine + imaginary[oddIndex] * cosine;
        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }
}

function reflectIndex(index: number, length: number): number {
  if (length === 1) return 0;
  let reflected = index;
  while (reflected < 0 || reflected >= length) {
    reflected = reflected < 0 ? -reflected : 2 * length - 2 - reflected;
  }
  return reflected;
}

const MEL_FILTERBANK = createMelFilterbank();
const WINDOW = createWindow();

export function extractLogMelFeatures(audio: DecodedWav): Float32Array[] {
  if (audio.sampleRate !== SAMPLE_RATE) {
    throw new Error(
      `Nemotron audio features require a 16000 Hz sample rate; received ${audio.sampleRate} Hz.`,
    );
  }
  if (audio.pcm.length === 0) return [];

  const emphasized = new Float32Array(audio.pcm.length);
  emphasized[0] = audio.pcm[0];
  for (let index = 1; index < audio.pcm.length; index += 1) {
    emphasized[index] = audio.pcm[index] - PREEMPHASIS * audio.pcm[index - 1];
  }

  const frameCount = 1 + Math.floor(audio.pcm.length / HOP_LENGTH);
  const padding = FFT_SIZE / 2;
  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const real = new Float32Array(FFT_SIZE);
    const imaginary = new Float32Array(FFT_SIZE);
    const frameStart = frameIndex * HOP_LENGTH - padding;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      real[index] = emphasized[reflectIndex(frameStart + index, emphasized.length)] * WINDOW[index];
    }
    fft(real, imaginary);

    return Float32Array.from({ length: MEL_BIN_COUNT }, (_, melIndex) => {
      let energy = 0;
      const filter = MEL_FILTERBANK[melIndex];
      for (let fftIndex = 0; fftIndex < FFT_BIN_COUNT; fftIndex += 1) {
        energy +=
          filter[fftIndex] *
          (real[fftIndex] * real[fftIndex] + imaginary[fftIndex] * imaginary[fftIndex]);
      }
      return Math.log(energy + LOG_ZERO_GUARD);
    });
  });
}
