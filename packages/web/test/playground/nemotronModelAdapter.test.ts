import * as ort from "onnxruntime-web";
import { describe, expect, it } from "vite-plus/test";

import {
  createNemotronModelAdapter,
  stripNemotronLanguageTag,
} from "@/lib/playground/nemotron/modelAdapter";
import {
  NEMOTRON_MODEL_ID,
  NEMOTRON_MODEL_REVISION,
  type NemotronSessionManager,
  type NemotronSessions,
} from "@/lib/playground/nemotron/sessionManager";

const session = (run: NemotronSessions["encoder"]["run"]): NemotronSessions["encoder"] =>
  ({ run }) as NemotronSessions["encoder"];

describe("Nemotron model adapter", () => {
  it("describes the pinned model and runtime", () => {
    expect(createNemotronModelAdapter().identity).toMatchObject({
      modelId: NEMOTRON_MODEL_ID,
      modelRevision: { status: "known", value: NEMOTRON_MODEL_REVISION },
      adapter: "nemotron-rnnt",
      runtime: "onnxruntime-web",
    });
  });

  it("carries encoder caches across chunks and removes the terminal language tag", async () => {
    const encoderFeeds: ort.InferenceSession.FeedsType[] = [];
    const encoderChannels: ort.Tensor[] = [];
    const scores = [0, 13_087, 1, 13_087];
    let jointCall = 0;
    const encoder = session(async (feeds) => {
      encoderFeeds.push(feeds);
      const nextChannel = new ort.Tensor("float32", new Float32Array(1), [1]);
      encoderChannels.push(nextChannel);
      return {
        outputs: new ort.Tensor("float32", new Float32Array(1024), [1, 1, 1024]),
        encoded_lengths: new ort.Tensor("int64", BigInt64Array.of(1n), [1]),
        cache_last_channel_next: nextChannel,
        cache_last_time_next: new ort.Tensor("float32", new Float32Array(1), [1]),
        cache_last_channel_len_next: new ort.Tensor("int64", BigInt64Array.of(1n), [1]),
      };
    });
    const decoder = session(async () => ({
      decoder_output: new ort.Tensor("float32", new Float32Array(640), [1, 640, 1]),
      h_out: new ort.Tensor("float32", new Float32Array(1280), [2, 1, 640]),
      c_out: new ort.Tensor("float32", new Float32Array(1280), [2, 1, 640]),
    }));
    const joint = session(async () => {
      const data = new Float32Array(13_088);
      data[scores[jointCall++]] = 1;
      return { joint_output: new ort.Tensor("float32", data, [1, 1, 1, 13_088]) };
    });
    const vocabulary = Array.from({ length: 13_088 }, () => "");
    vocabulary[0] = "▁hello";
    vocabulary[1] = "<en-US>";
    vocabulary[13_087] = "<blank>";
    const sessions: NemotronSessions = {
      encoder,
      decoder,
      joint,
      encoderDevice: "wasm",
      vocabulary,
    };
    const manager: NemotronSessionManager = { load: async () => sessions };
    const adapter = createNemotronModelAdapter({ sessionManager: manager });

    const prediction = await adapter.predict({
      pcm: new Float32Array(9_000),
      sampleRate: 16_000,
      example: {},
    });

    expect(prediction).toBe("hello");
    expect(encoderFeeds).toHaveLength(2);
    expect(encoderFeeds[0].audio_signal.dims).toEqual([1, 65, 128]);
    expect(encoderFeeds[0].lang_id.data).toEqual(BigInt64Array.of(101n));
    expect(encoderFeeds[1].cache_last_channel).toBe(encoderChannels[0]);
  });
});

describe("stripNemotronLanguageTag", () => {
  it.each(["Hello <en-US>", "你好<zh-CN>", "Bonjour"])("normalizes %s", (value) => {
    expect(stripNemotronLanguageTag(value)).toBe(
      value === "Bonjour" ? value : value.replace(/\s*<.*>$/u, ""),
    );
  });
});
