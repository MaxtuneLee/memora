import * as ort from "onnxruntime-web";
import { extractLogMelFeatures, type ModelAdapter } from "@memora/evaluation";

import { decodeRnnt } from "./rnnt";
import {
  NEMOTRON_MODEL_ID,
  NEMOTRON_MODEL_REVISION,
  nemotronSessionManager,
  type NemotronSessionManager,
  type NemotronSessions,
} from "./sessionManager";

const MEL_BINS = 128;
const CHUNK_FRAMES = 56;
const PRE_ENCODE_CACHE_FRAMES = 9;
const ENCODER_LAYERS = 24;
const ENCODER_HIDDEN_SIZE = 1024;
const ENCODER_LEFT_CONTEXT = 56;
const CONV_CONTEXT = 8;
const DECODER_LAYERS = 2;
const DECODER_HIDDEN_SIZE = 640;
const BLANK_TOKEN_ID = 13_087;
const MAX_SYMBOLS_PER_FRAME = 10;
const AUTO_LANGUAGE_ID = 101;
const LANGUAGE_TAG = /\s*<[a-z]{2,3}-[A-Z]{2}>\s*$/u;

type Tensor = ort.Tensor;

interface DecoderState {
  hidden: Tensor;
  cell: Tensor;
}

export interface CreateNemotronModelAdapterOptions {
  sessionManager?: NemotronSessionManager;
  languageId?: number;
}

const requireTensor = (outputs: ort.InferenceSession.ReturnType, name: string): Tensor => {
  const tensor = outputs[name];
  if (!tensor) throw new Error(`Nemotron session did not return ${name}.`);
  return tensor;
};

const int64Tensor = (values: readonly number[], dimensions: readonly number[]): Tensor =>
  new ort.Tensor("int64", BigInt64Array.from(values, BigInt), dimensions);

const createEncoderCache = (): { channel: Tensor; time: Tensor; length: Tensor } => ({
  channel: new ort.Tensor(
    "float32",
    new Float32Array(ENCODER_LAYERS * ENCODER_LEFT_CONTEXT * ENCODER_HIDDEN_SIZE),
    [1, ENCODER_LAYERS, ENCODER_LEFT_CONTEXT, ENCODER_HIDDEN_SIZE],
  ),
  time: new ort.Tensor(
    "float32",
    new Float32Array(ENCODER_LAYERS * ENCODER_HIDDEN_SIZE * CONV_CONTEXT),
    [1, ENCODER_LAYERS, ENCODER_HIDDEN_SIZE, CONV_CONTEXT],
  ),
  length: int64Tensor([0], [1]),
});

const createDecoderState = (): DecoderState => ({
  hidden: new ort.Tensor("float32", new Float32Array(DECODER_LAYERS * DECODER_HIDDEN_SIZE), [
    DECODER_LAYERS,
    1,
    DECODER_HIDDEN_SIZE,
  ]),
  cell: new ort.Tensor("float32", new Float32Array(DECODER_LAYERS * DECODER_HIDDEN_SIZE), [
    DECODER_LAYERS,
    1,
    DECODER_HIDDEN_SIZE,
  ]),
});

const encoderFrames = (tensor: Tensor, length: number): Tensor[] => {
  const data = tensor.data as Float32Array;
  const frameMajor = tensor.dims[2] === ENCODER_HIDDEN_SIZE;
  const hiddenSize = frameMajor ? tensor.dims[2] : tensor.dims[1];
  const availableFrames = frameMajor ? tensor.dims[1] : tensor.dims[2];
  if (tensor.dims.length !== 3 || tensor.dims[0] !== 1 || hiddenSize !== ENCODER_HIDDEN_SIZE) {
    throw new Error(`Unexpected Nemotron encoder output shape: [${tensor.dims.join(", ")}].`);
  }
  return Array.from({ length: Math.min(length, availableFrames) }, (_, frameIndex) => {
    const frame = new Float32Array(hiddenSize);
    for (let channel = 0; channel < hiddenSize; channel += 1) {
      frame[channel] = frameMajor
        ? data[frameIndex * hiddenSize + channel]
        : data[channel * availableFrames + frameIndex];
    }
    return new ort.Tensor("float32", frame, [1, hiddenSize, 1]);
  });
};

const encode = async (
  sessions: NemotronSessions,
  features: readonly Float32Array[],
  languageId: number,
  signal?: AbortSignal,
): Promise<Tensor[]> => {
  let cache = createEncoderCache();
  let preEncodeCache: readonly Float32Array[] = Array.from(
    { length: PRE_ENCODE_CACHE_FRAMES },
    () => new Float32Array(MEL_BINS),
  );
  const frames: Tensor[] = [];

  for (let start = 0; start < features.length; start += CHUNK_FRAMES) {
    signal?.throwIfAborted();
    const chunk = features.slice(start, start + CHUNK_FRAMES);
    const inputFrames = [...preEncodeCache, ...chunk];
    const paddedFrameCount = PRE_ENCODE_CACHE_FRAMES + CHUNK_FRAMES;
    const data = new Float32Array(paddedFrameCount * MEL_BINS);
    for (let frame = 0; frame < inputFrames.length; frame += 1) {
      for (let mel = 0; mel < MEL_BINS; mel += 1)
        data[frame * MEL_BINS + mel] = inputFrames[frame][mel];
    }

    const output = await sessions.encoder.run({
      audio_signal: new ort.Tensor("float32", data, [1, paddedFrameCount, MEL_BINS]),
      length: int64Tensor([inputFrames.length], [1]),
      cache_last_channel: cache.channel,
      cache_last_time: cache.time,
      cache_last_channel_len: cache.length,
      lang_id: int64Tensor([languageId], [1]),
    });
    signal?.throwIfAborted();
    cache = {
      channel: requireTensor(output, "cache_last_channel_next"),
      time: requireTensor(output, "cache_last_time_next"),
      length: requireTensor(output, "cache_last_channel_len_next"),
    };
    const encodedLength = Number(
      (requireTensor(output, "encoded_lengths").data as BigInt64Array)[0],
    );
    frames.push(...encoderFrames(requireTensor(output, "outputs"), encodedLength));
    preEncodeCache = inputFrames.slice(-PRE_ENCODE_CACHE_FRAMES);
  }
  return frames;
};

const decode = async (
  sessions: NemotronSessions,
  frames: readonly Tensor[],
  signal?: AbortSignal,
): Promise<string> => {
  const initialState = createDecoderState();
  return decodeRnnt(
    {
      encoderFrames: frames,
      blankTokenId: BLANK_TOKEN_ID,
      maxSymbolsPerFrame: MAX_SYMBOLS_PER_FRAME,
      initialDecoderState: initialState,
      decode: async (tokenId, state) => {
        signal?.throwIfAborted();
        const output = await sessions.decoder.run({
          targets: int64Tensor([tokenId], [1, 1]),
          h_in: state.hidden,
          c_in: state.cell,
        });
        return {
          output: requireTensor(output, "decoder_output"),
          state: {
            hidden: requireTensor(output, "h_out"),
            cell: requireTensor(output, "c_out"),
          },
        };
      },
      join: async (encoderFrame, decoderOutput) => {
        signal?.throwIfAborted();
        const output = await sessions.joint.run({
          encoder_output: encoderFrame,
          decoder_output: decoderOutput,
        });
        return requireTensor(output, "joint_output").data as Float32Array;
      },
    },
    sessions.vocabulary,
  );
};

export const stripNemotronLanguageTag = (transcript: string): string =>
  transcript.replace(LANGUAGE_TAG, "").trim();

export const createNemotronModelAdapter = ({
  sessionManager = nemotronSessionManager,
  languageId = AUTO_LANGUAGE_ID,
}: CreateNemotronModelAdapterOptions = {}): ModelAdapter => {
  let sessions: NemotronSessions | undefined;
  const load = async (signal?: AbortSignal) => {
    sessions ??= await sessionManager.load({ signal });
    return sessions;
  };

  return {
    identity: {
      modelId: NEMOTRON_MODEL_ID,
      modelRevision: { status: "known", value: NEMOTRON_MODEL_REVISION },
      adapter: "nemotron-rnnt",
      runtime: "onnxruntime-web",
      inference: {
        chunkSamples: 8_960,
        encoder: "webgpu-with-wasm-fallback",
        decoder: "wasm",
        languageId,
      },
    },
    initialize: async (signal) => {
      await load(signal);
    },
    predict: async ({ pcm, sampleRate }, signal) => {
      signal?.throwIfAborted();
      const loaded = await load(signal);
      const features = extractLogMelFeatures({ pcm, sampleRate });
      if (features.length === 0) return "";
      const transcript = await decode(
        loaded,
        await encode(loaded, features, languageId, signal),
        signal,
      );
      return stripNemotronLanguageTag(transcript);
    },
  };
};
