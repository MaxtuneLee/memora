import * as ort from "onnxruntime-web/webgpu";
import { expect, test, vi } from "vite-plus/test";

import {
  NemotronStreamingDecoder,
  resolveNemotronLanguageId,
} from "@memora/local-model-runtime/worker";

test.each(["en", "ja", "auto"])(
  "passes the %s language id as one tensor value",
  async (language) => {
    let languageTensor: ort.Tensor | undefined;
    const encoder = {
      run: vi.fn(async (feeds: Record<string, ort.Tensor>) => {
        languageTensor = feeds.lang_id;
        return {
          outputs: new ort.Tensor("float32", new Float32Array(), [1, 0, 1024]),
          encoded_lengths: new ort.Tensor("int64", BigInt64Array.from([0n]), [1]),
          cache_last_channel_next: feeds.cache_last_channel,
          cache_last_time_next: feeds.cache_last_time,
          cache_last_channel_len_next: feeds.cache_last_channel_len,
        };
      }),
    };
    const decoder = new NemotronStreamingDecoder(
      {
        encoder,
        decoder: { run: vi.fn() },
        joint: { run: vi.fn() },
        vocabulary: [],
      } as never,
      resolveNemotronLanguageId(language),
    );

    await decoder.push(new Float32Array(16_000));

    expect(languageTensor?.dims).toEqual([1]);
    expect(languageTensor?.data).toEqual(
      BigInt64Array.from([BigInt(resolveNemotronLanguageId(language))]),
    );
  },
);

test("does not advance the prediction network again for blank encoder frames", async () => {
  const encoder = {
    run: vi.fn(async (feeds: Record<string, ort.Tensor>) => ({
      outputs: new ort.Tensor("float32", new Float32Array(2 * 1024), [1, 2, 1024]),
      encoded_lengths: new ort.Tensor("int64", BigInt64Array.from([2n]), [1]),
      cache_last_channel_next: feeds.cache_last_channel,
      cache_last_time_next: feeds.cache_last_time,
      cache_last_channel_len_next: feeds.cache_last_channel_len,
    })),
  };
  const decoder = {
    run: vi.fn(async () => ({
      decoder_output: new ort.Tensor("float32", new Float32Array(640), [1, 1, 640]),
      h_out: new ort.Tensor("float32", new Float32Array(2 * 640), [2, 1, 640]),
      c_out: new ort.Tensor("float32", new Float32Array(2 * 640), [2, 1, 640]),
    })),
  };
  const logits = new Float32Array(13_088).fill(-1);
  logits[13_087] = 0;
  const joint = {
    run: vi.fn(async () => ({
      joint_output: new ort.Tensor("float32", logits, [1, 1, 13_088]),
    })),
  };
  const streamingDecoder = new NemotronStreamingDecoder(
    { encoder, decoder, joint, vocabulary: [] } as never,
    resolveNemotronLanguageId("en"),
  );

  await streamingDecoder.push(new Float32Array(16_000));

  expect(decoder.run).toHaveBeenCalledOnce();
  expect(joint.run).toHaveBeenCalledTimes(2);
});
