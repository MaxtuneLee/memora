export const SAMPLE_RATE = 16_000;
export const HOP_SIZE = 160;
export const MEL_BAND_COUNT = 128;

const FFT_SIZE = 512;
const WINDOW_SIZE = 400;
const FMIN = 0;
const FMAX = 8_000;
const PREEMPHASIS = 0.97;
const LOG_GUARD = 1e-10;
const BIN_COUNT = FFT_SIZE / 2 + 1;

// HTK/Kaldi mel scale: linear below 1kHz, log above it. This is a different curve
// from the Slaney/O'Shaughnessy 2595*log10(1+hz/700) formula — using the wrong one
// silently shifts every filter's center frequency instead of throwing an error.
const MEL_BREAK_FREQUENCY = 1_000;
const MEL_BREAK = MEL_BREAK_FREQUENCY / (200 / 3);
const LOG_STEP = Math.log(6.4) / 27;

const hertzToMel = (hertz: number): number => {
  const mel = hertz / (200 / 3);
  return hertz >= MEL_BREAK_FREQUENCY
    ? MEL_BREAK + Math.log(hertz / MEL_BREAK_FREQUENCY) / LOG_STEP
    : mel;
};

const melToHertz = (mel: number): number => {
  const hertz = (200 / 3) * mel;
  return mel >= MEL_BREAK ? MEL_BREAK_FREQUENCY * Math.exp(LOG_STEP * (mel - MEL_BREAK)) : hertz;
};

interface MelFilter {
  low: number;
  center: number;
  high: number;
  norm: number;
}

const buildMelFilterbank = (): MelFilter[] => {
  const minMel = hertzToMel(FMIN);
  const maxMel = hertzToMel(FMAX);
  const points = Array.from({ length: MEL_BAND_COUNT + 2 }, (_, index) =>
    melToHertz(minMel + ((maxMel - minMel) * index) / (MEL_BAND_COUNT + 1)),
  );
  return Array.from({ length: MEL_BAND_COUNT }, (_, band) => ({
    low: points[band],
    center: points[band + 1],
    high: points[band + 2],
    norm: 2 / (points[band + 2] - points[band]),
  }));
};

const buildWindow = (): Float32Array => {
  const window = new Float32Array(FFT_SIZE);
  const offset = (FFT_SIZE - WINDOW_SIZE) >> 1;
  for (let index = 0; index < WINDOW_SIZE; index += 1) {
    window[offset + index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / WINDOW_SIZE);
  }
  return window;
};

const MEL_FILTERBANK = buildMelFilterbank();
const WINDOW = buildWindow();
const BIN_FREQUENCIES = Array.from(
  { length: BIN_COUNT },
  (_, bin) => (bin * SAMPLE_RATE) / FFT_SIZE,
);

const fft = (real: Float32Array, imaginary: Float32Array): void => {
  for (let index = 1, reversed = 0; index < FFT_SIZE; index += 1) {
    let bit = FFT_SIZE >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let offset = 0; offset < FFT_SIZE; offset += size) {
      for (let index = 0; index < half; index += 1) {
        const angle = step * index;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const even = offset + index;
        const odd = even + half;
        const nextReal = real[odd] * cosine - imaginary[odd] * sine;
        const nextImaginary = real[odd] * sine + imaginary[odd] * cosine;
        real[odd] = real[even] - nextReal;
        imaginary[odd] = imaginary[even] - nextImaginary;
        real[even] += nextReal;
        imaginary[even] += nextImaginary;
      }
    }
  }
};

// Reflects an out-of-range index back into [0, x.length), matching librosa/np.pad's
// "reflect" mode used to pad audio before centered STFT framing.
const reflectIndex = (length: number, index: number): number => {
  if (length === 1) return 0;
  let value = index;
  while (value < 0 || value >= length) {
    if (value < 0) value = -value;
    if (value >= length) value = 2 * length - 2 - value;
  }
  return value;
};

const frameToMel = (
  segment: Float32Array,
  offset: number,
  real: Float32Array,
  imaginary: Float32Array,
): Float32Array => {
  for (let index = 0; index < FFT_SIZE; index += 1) {
    real[index] = segment[offset + index] * WINDOW[index];
    imaginary[index] = 0;
  }
  fft(real, imaginary);
  const mel = new Float32Array(MEL_BAND_COUNT);
  for (let band = 0; band < MEL_BAND_COUNT; band += 1) {
    const filter = MEL_FILTERBANK[band];
    let energy = 0;
    for (let bin = 0; bin < BIN_COUNT; bin += 1) {
      const frequency = BIN_FREQUENCIES[bin];
      let weight = Math.min(
        (frequency - filter.low) / (filter.center - filter.low),
        (filter.high - frequency) / (filter.high - filter.center),
      );
      if (weight < 0) weight = 0;
      energy += weight * filter.norm * (real[bin] ** 2 + imaginary[bin] ** 2);
    }
    mel[band] = Math.log(energy + LOG_GUARD);
  }
  return mel;
};

const applyPreemphasis = (samples: Float32Array, previousSample: number): Float32Array => {
  const output = new Float32Array(samples.length);
  if (samples.length === 0) return output;
  output[0] = samples[0] - PREEMPHASIS * previousSample;
  for (let index = 1; index < samples.length; index += 1) {
    output[index] = samples[index] - PREEMPHASIS * samples[index - 1];
  }
  return output;
};

/**
 * Converts raw PCM arriving in arbitrarily-sized chunks into a continuous sequence of
 * mel-feature frames, hop-spaced with no gaps or duplication across chunk boundaries.
 * Mirrors librosa/Kaldi's centered STFT: the very first chunk is reflect-padded by
 * FFT_SIZE/2 samples so the first frame is centered on sample 0, and pre-emphasis
 * continuity is carried across chunks via the last raw sample seen.
 */
export class NemotronMelStream {
  private previousSample = 0;
  private started = false;
  private buffer = new Float32Array(0);
  private readonly real = new Float32Array(FFT_SIZE);
  private readonly imaginary = new Float32Array(FFT_SIZE);

  push(samples: Float32Array): Float32Array[] {
    const filtered = applyPreemphasis(samples, this.previousSample);
    if (samples.length > 0) this.previousSample = samples[samples.length - 1];

    let head = new Float32Array(0);
    if (!this.started) {
      const pad = FFT_SIZE >> 1;
      head = new Float32Array(pad);
      for (let index = 0; index < pad; index += 1) {
        head[index] = filtered[reflectIndex(filtered.length, index - pad)];
      }
      this.started = true;
    }

    const merged = new Float32Array(this.buffer.length + head.length + filtered.length);
    merged.set(this.buffer, 0);
    merged.set(head, this.buffer.length);
    merged.set(filtered, this.buffer.length + head.length);
    this.buffer = merged;

    const frames: Float32Array[] = [];
    let offset = 0;
    while (this.buffer.length - offset >= FFT_SIZE) {
      frames.push(frameToMel(this.buffer, offset, this.real, this.imaginary));
      offset += HOP_SIZE;
    }
    if (offset > 0) this.buffer = this.buffer.slice(offset);
    return frames;
  }

  /**
   * Reflect-pads the leftover tail PCM by FFT_SIZE/2 samples, mirroring the start-of-stream
   * padding, and emits any mel frames that padding completes. Call once when the stream
   * closes — without it, the last frame or (for very short audio) every frame never
   * reaches the FFT_SIZE threshold in `push` and is silently dropped.
   */
  flush(): Float32Array[] {
    const length = this.buffer.length;
    if (length === 0) return [];
    const pad = FFT_SIZE >> 1;
    const padded = new Float32Array(length + pad);
    padded.set(this.buffer);
    for (let index = 0; index < pad; index += 1) {
      padded[length + index] = this.buffer[reflectIndex(length, length + index)];
    }
    this.buffer = padded;

    const frames: Float32Array[] = [];
    let offset = 0;
    while (this.buffer.length - offset >= FFT_SIZE) {
      frames.push(frameToMel(this.buffer, offset, this.real, this.imaginary));
      offset += HOP_SIZE;
    }
    this.buffer = this.buffer.slice(offset);
    return frames;
  }
}
