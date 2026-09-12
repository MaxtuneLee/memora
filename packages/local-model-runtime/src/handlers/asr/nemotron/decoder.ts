import * as ort from "onnxruntime-web/webgpu";

import { MEL_BAND_COUNT, NemotronMelStream } from "./features";
import { NEMOTRON_AUTO_LANGUAGE_ID } from "./language";
import type { NemotronSessions } from "./sessions";
import { tokenToText, tokensToTimestampedWords, type EmittedToken } from "./words";

const BLANK_TOKEN_ID = 13_087;
const MAX_SYMBOLS_PER_FRAME = 10;

// The encoder takes a fixed-size window: 9 frames of look-back context plus 56 new
// frames per call (matching NVIDIA's published cache-aware streaming config for this
// model). Blocks run only once 56 new frames are available; the final, possibly
// shorter block is flushed explicitly. `length` tells the model how many of the 65
// frames are real; the rest are left zeroed.
const PRE_ENCODE_CACHE_FRAMES = 9;
const CHUNK_FRAMES = 56;
const ENCODER_INPUT_FRAMES = PRE_ENCODE_CACHE_FRAMES + CHUNK_FRAMES;
const DECODER_HIDDEN_SIZE = 640;
const DECODER_LAYERS = 2;
const ENCODER_HIDDEN_SIZE = 1024;
const ENCODER_LAYERS = 24;
const ENCODER_LEFT_CONTEXT = 56;
const CONV_CONTEXT = 8;
// The encoder subsamples time by 8x, so each of its output frames covers 8 mel hops.
const ENCODER_FRAME_SECONDS = 0.08;

type TensorMap = Record<string, ort.Tensor>;

const createFloatTensor = (data: Float32Array, dimensions: readonly number[]): ort.Tensor =>
  new ort.Tensor("float32", data, [...dimensions]);

// The model's integer inputs (lengths and token ids) are int64, not int32.
const createInt64Tensor = (values: readonly number[], dimensions: readonly number[]): ort.Tensor =>
  new ort.Tensor("int64", BigInt64Array.from(values, BigInt), [...dimensions]);

const namedTensor = (result: TensorMap, name: string): ort.Tensor => {
  const value = result[name];
  if (!value) throw new Error(`Nemotron session did not return ${name}.`);
  return value;
};

const indexOfLargest = (values: ArrayLike<number>): number => {
  let index = 0;
  for (let current = 1; current < values.length; current += 1) {
    if (values[current] > values[index]) index = current;
  }
  return index;
};

export class NemotronStreamingDecoder {
  private readonly melStream = new NemotronMelStream();
  private frames: Float32Array[] = [];
  private frameOffset = 0;
  private consumed = 0;

  private cacheLastChannel: Float32Array = new Float32Array(
    ENCODER_LAYERS * ENCODER_LEFT_CONTEXT * ENCODER_HIDDEN_SIZE,
  );
  private cacheLastTime: Float32Array = new Float32Array(
    ENCODER_LAYERS * ENCODER_HIDDEN_SIZE * CONV_CONTEXT,
  );
  private cacheLastChannelLength: BigInt64Array = BigInt64Array.from([0], BigInt);
  private decoderHidden: Float32Array = new Float32Array(DECODER_LAYERS * DECODER_HIDDEN_SIZE);
  private decoderCell: Float32Array = new Float32Array(DECODER_LAYERS * DECODER_HIDDEN_SIZE);
  private decoderOutput: Float32Array | undefined;
  private tokens: number[] = [];
  private transcript = "";
  private emittedTokens: EmittedToken[] = [];
  private encodedFrames = 0;

  constructor(
    private readonly sessions: NemotronSessions,
    private readonly languageId: number = NEMOTRON_AUTO_LANGUAGE_ID,
  ) {}

  get text(): string {
    return this.transcript.trim();
  }

  async push(audio: Float32Array): Promise<string> {
    if (!audio.length) return this.transcript;
    this.frames.push(...this.melStream.push(audio));
    while (this.frames.length + this.frameOffset - this.consumed >= CHUNK_FRAMES) {
      await this.runBlock(CHUNK_FRAMES);
    }
    return this.text;
  }

  /** Processes any buffered mel frames shorter than a full block. Call once at end of audio. */
  async flush(): Promise<string> {
    this.frames.push(...this.melStream.flush());
    while (this.frames.length + this.frameOffset - this.consumed >= CHUNK_FRAMES) {
      await this.runBlock(CHUNK_FRAMES);
    }
    const remaining = this.frames.length + this.frameOffset - this.consumed;
    if (remaining > 0) await this.runBlock(remaining);
    return this.text;
  }

  timestampedWords(durationSeconds: number): Array<{ text: string; timestamp: [number, number] }> {
    return tokensToTimestampedWords(this.emittedTokens, durationSeconds);
  }

  private async runBlock(validNewFrames: number): Promise<void> {
    const base = this.consumed;
    const inputData = new Float32Array(ENCODER_INPUT_FRAMES * MEL_BAND_COUNT);
    for (let position = 0; position < ENCODER_INPUT_FRAMES; position += 1) {
      const globalIndex = base - PRE_ENCODE_CACHE_FRAMES + position;
      const localIndex = globalIndex - this.frameOffset;
      if (globalIndex >= 0 && localIndex >= 0 && localIndex < this.frames.length) {
        inputData.set(this.frames[localIndex], position * MEL_BAND_COUNT);
      }
    }
    const validFrameCount = PRE_ENCODE_CACHE_FRAMES + validNewFrames;

    const encoderOutput = await this.sessions.encoder.run({
      audio_signal: createFloatTensor(inputData, [1, ENCODER_INPUT_FRAMES, MEL_BAND_COUNT]),
      length: createInt64Tensor([validFrameCount], [1]),
      cache_last_channel: createFloatTensor(this.cacheLastChannel, [
        1,
        ENCODER_LAYERS,
        ENCODER_LEFT_CONTEXT,
        ENCODER_HIDDEN_SIZE,
      ]),
      cache_last_time: createFloatTensor(this.cacheLastTime, [
        1,
        ENCODER_LAYERS,
        ENCODER_HIDDEN_SIZE,
        CONV_CONTEXT,
      ]),
      cache_last_channel_len: new ort.Tensor("int64", this.cacheLastChannelLength, [1]),
      lang_id: createInt64Tensor([this.languageId], [1]),
    });
    const encoded = namedTensor(encoderOutput, "outputs");
    this.cacheLastChannel = namedTensor(encoderOutput, "cache_last_channel_next")
      .data as Float32Array;
    this.cacheLastTime = namedTensor(encoderOutput, "cache_last_time_next").data as Float32Array;
    this.cacheLastChannelLength = namedTensor(encoderOutput, "cache_last_channel_len_next")
      .data as BigInt64Array;
    const encodedLength = Number(
      (namedTensor(encoderOutput, "encoded_lengths").data as BigInt64Array)[0],
    );

    const dimensions = encoded.dims;
    // The final, shorter block still runs through a fixed-size, zero-padded encoder
    // window, so the padded tail of `outputs` decodes to garbage. `encoded_lengths`
    // is the model's own count of how many leading frames are real; the rest must
    // be dropped rather than fed to the RNN-T.
    const outputFrames = Math.min(dimensions.at(-2) ?? 0, encodedLength);
    const hiddenSize = dimensions.at(-1) ?? ENCODER_HIDDEN_SIZE;
    const values = encoded.data as Float32Array;
    for (let frame = 0; frame < outputFrames; frame += 1) {
      await this.decodeFrame(
        values.subarray(frame * hiddenSize, (frame + 1) * hiddenSize),
        hiddenSize,
        (this.encodedFrames + frame) * ENCODER_FRAME_SECONDS,
      );
    }
    this.encodedFrames += outputFrames;

    this.consumed += CHUNK_FRAMES;
    const keepFrom = this.consumed - PRE_ENCODE_CACHE_FRAMES;
    if (keepFrom > this.frameOffset) {
      this.frames = this.frames.slice(keepFrom - this.frameOffset);
      this.frameOffset = keepFrom;
    }
  }

  private async decodeFrame(
    frame: Float32Array,
    hiddenSize: number,
    seconds: number,
  ): Promise<void> {
    await this.ensureDecoderOutput();
    for (let symbol = 0; symbol < MAX_SYMBOLS_PER_FRAME; symbol += 1) {
      const decoderOutput = this.decoderOutput;
      if (!decoderOutput) throw new Error("Nemotron decoder state was not initialized.");
      const joint = await this.sessions.joint.run({
        encoder_output: createFloatTensor(frame, [1, 1, hiddenSize]),
        decoder_output: createFloatTensor(decoderOutput, [1, 1, DECODER_HIDDEN_SIZE]),
      });
      const next = indexOfLargest(namedTensor(joint, "joint_output").data as Float32Array);
      if (next === BLANK_TOKEN_ID) return;
      this.tokens.push(next);
      await this.advanceDecoder(next);
      const text = tokenToText(this.sessions.vocabulary[next] ?? "");
      this.transcript += text;
      if (text) this.emittedTokens.push({ text, seconds });
    }
  }

  private async ensureDecoderOutput(): Promise<void> {
    if (this.decoderOutput) return;
    await this.advanceDecoder(BLANK_TOKEN_ID);
  }

  private async advanceDecoder(token: number): Promise<void> {
    const decoder = await this.sessions.decoder.run({
      targets: createInt64Tensor([token], [1, 1]),
      h_in: createFloatTensor(this.decoderHidden, [DECODER_LAYERS, 1, DECODER_HIDDEN_SIZE]),
      c_in: createFloatTensor(this.decoderCell, [DECODER_LAYERS, 1, DECODER_HIDDEN_SIZE]),
    });
    this.decoderOutput = namedTensor(decoder, "decoder_output").data as Float32Array;
    this.decoderHidden = namedTensor(decoder, "h_out").data as Float32Array;
    this.decoderCell = namedTensor(decoder, "c_out").data as Float32Array;
  }
}
