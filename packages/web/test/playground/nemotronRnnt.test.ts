import { describe, expect, it } from "vite-plus/test";

import { decodeRnnt, detokenizeRnnt, greedyDecodeRnnt } from "@/lib/playground/nemotron/rnnt";

describe("greedyDecodeRnnt", () => {
  it("returns decoded text from encoder frames and a vocabulary", async () => {
    const emittedTokens = [1, 2, 0];
    let jointCall = 0;

    const text = await decodeRnnt(
      {
        encoderFrames: ["frame"],
        blankTokenId: 0,
        initialDecoderState: 0,
        decode: async (_tokenId, state) => ({ output: state, state: state + 1 }),
        join: async () => {
          const tokenId = emittedTokens[jointCall++];
          return [0, 0, 0].map((_, index) => (index === tokenId ? 1 : 0));
        },
      },
      ["<blank>", "▁Hello", "▁world"],
    );

    expect(text).toBe("Hello world");
  });

  it("decodes encoder frames into a known token sequence", async () => {
    const emittedTokens = [1, 2, 0, 3, 0];
    let jointCall = 0;

    const tokenIds = await greedyDecodeRnnt({
      encoderFrames: ["first", "second"],
      blankTokenId: 0,
      initialDecoderState: 0,
      decode: async (_tokenId, state) => ({ output: state, state: state + 1 }),
      join: async () => {
        const tokenId = emittedTokens[jointCall++];
        return tokenId === 0
          ? [1, 0, 0, 0]
          : [0, 0, 0, 0].map((_, index) => (index === tokenId ? 1 : 0));
      },
    });

    expect(tokenIds).toEqual([1, 2, 3]);
    expect(detokenizeRnnt(tokenIds, ["<blank>", "▁Hello", "▁world", "!"])).toBe("Hello world!");
  });

  it("moves to the next frame as soon as the joint network emits blank", async () => {
    const joinedFrames: number[] = [];

    const tokenIds = await greedyDecodeRnnt({
      encoderFrames: [10, 20, 30],
      blankTokenId: 0,
      initialDecoderState: undefined,
      decode: async () => ({ output: undefined, state: undefined }),
      join: async (frame) => {
        joinedFrames.push(frame);
        return [1];
      },
    });

    expect(tokenIds).toEqual([]);
    expect(joinedFrames).toEqual([10, 20, 30]);
  });

  it("limits symbols emitted for each encoder frame", async () => {
    let jointCalls = 0;

    const tokenIds = await greedyDecodeRnnt({
      encoderFrames: [10, 20],
      blankTokenId: 0,
      maxSymbolsPerFrame: 3,
      initialDecoderState: 0,
      decode: async (_tokenId, state) => ({ output: state, state: state + 1 }),
      join: async () => {
        jointCalls += 1;
        return [0, 1];
      },
    });

    expect(tokenIds).toEqual([1, 1, 1, 1, 1, 1]);
    expect(jointCalls).toBe(6);
  });

  it("reports the frame index for each emitted token via onToken", async () => {
    const emittedTokens = [1, 0, 2, 0, 3, 0];
    let jointCall = 0;
    const observed: Array<{ tokenId: number; frameIndex: number }> = [];

    await greedyDecodeRnnt({
      encoderFrames: ["first", "second", "third"],
      blankTokenId: 0,
      initialDecoderState: 0,
      decode: async (_tokenId, state) => ({ output: state, state: state + 1 }),
      join: async () => {
        const tokenId = emittedTokens[jointCall++];
        return [0, 0, 0, 0].map((_, index) => (index === tokenId ? 1 : 0));
      },
      onToken: (tokenId, frameIndex) => observed.push({ tokenId, frameIndex }),
    });

    expect(observed).toEqual([
      { tokenId: 1, frameIndex: 0 },
      { tokenId: 2, frameIndex: 1 },
      { tokenId: 3, frameIndex: 2 },
    ]);
  });

  it("threads decoder state through emitted tokens and later frames", async () => {
    const emittedTokens = [4, 0, 5, 0];
    const decoderCalls: Array<{ tokenId: number; state: string }> = [];
    let jointCall = 0;

    await greedyDecodeRnnt({
      encoderFrames: ["first", "second"],
      blankTokenId: 0,
      initialDecoderState: "initial",
      decode: async (tokenId, state) => {
        decoderCalls.push({ tokenId, state });
        return { output: `${state}:${tokenId}`, state: `${state}>${tokenId}` };
      },
      join: async () => {
        const tokenId = emittedTokens[jointCall++];
        return [0, 0, 0, 0, 0, 0].map((_, index) => (index === tokenId ? 1 : 0));
      },
    });

    expect(decoderCalls).toEqual([
      { tokenId: 0, state: "initial" },
      { tokenId: 4, state: "initial>0" },
      { tokenId: 5, state: "initial>0>4" },
    ]);
  });
});

describe("detokenizeRnnt", () => {
  it("rejects token ids that are absent from the vocabulary", () => {
    expect(() => detokenizeRnnt([2], ["<blank>", "▁known"])).toThrow(
      "Token id 2 is missing from the vocabulary.",
    );
  });
});
