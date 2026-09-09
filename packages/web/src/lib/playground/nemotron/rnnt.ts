export interface DecoderStepResult<DecoderState, DecoderOutput> {
  output: DecoderOutput;
  state: DecoderState;
}

export interface GreedyDecodeRnntOptions<EncoderFrame, DecoderState, DecoderOutput> {
  encoderFrames: Iterable<EncoderFrame>;
  blankTokenId: number;
  maxSymbolsPerFrame?: number;
  initialDecoderState: DecoderState;
  decode: (
    tokenId: number,
    state: DecoderState,
  ) => Promise<DecoderStepResult<DecoderState, DecoderOutput>>;
  join: (encoderFrame: EncoderFrame, decoderOutput: DecoderOutput) => Promise<ArrayLike<number>>;
}

const DEFAULT_MAX_SYMBOLS_PER_FRAME = 10;

const argMax = (scores: ArrayLike<number>): number => {
  if (scores.length === 0) throw new Error("The joint network returned no token scores.");

  let bestTokenId = 0;
  let bestScore = scores[0];
  for (let tokenId = 1; tokenId < scores.length; tokenId += 1) {
    if (scores[tokenId] > bestScore) {
      bestTokenId = tokenId;
      bestScore = scores[tokenId];
    }
  }
  return bestTokenId;
};

export const greedyDecodeRnnt = async <EncoderFrame, DecoderState, DecoderOutput>({
  encoderFrames,
  blankTokenId,
  maxSymbolsPerFrame = DEFAULT_MAX_SYMBOLS_PER_FRAME,
  initialDecoderState,
  decode,
  join,
}: GreedyDecodeRnntOptions<EncoderFrame, DecoderState, DecoderOutput>): Promise<number[]> => {
  if (!Number.isInteger(maxSymbolsPerFrame) || maxSymbolsPerFrame <= 0) {
    throw new RangeError("maxSymbolsPerFrame must be a positive integer.");
  }

  let decoderState = initialDecoderState;
  let decoderStep = await decode(blankTokenId, decoderState);
  decoderState = decoderStep.state;
  const tokenIds: number[] = [];

  for (const encoderFrame of encoderFrames) {
    for (let symbol = 0; symbol < maxSymbolsPerFrame; symbol += 1) {
      const tokenId = argMax(await join(encoderFrame, decoderStep.output));
      if (tokenId === blankTokenId) break;

      tokenIds.push(tokenId);
      decoderStep = await decode(tokenId, decoderState);
      decoderState = decoderStep.state;
    }
  }

  return tokenIds;
};

export const detokenizeRnnt = (
  tokenIds: Iterable<number>,
  vocabulary: readonly string[],
): string => {
  let text = "";
  for (const tokenId of tokenIds) {
    const token = vocabulary[tokenId];
    if (token === undefined) {
      throw new RangeError(`Token id ${tokenId} is missing from the vocabulary.`);
    }
    text += token;
  }
  return text.replaceAll("▁", " ").trim();
};

export const decodeRnnt = async <EncoderFrame, DecoderState, DecoderOutput>(
  options: GreedyDecodeRnntOptions<EncoderFrame, DecoderState, DecoderOutput>,
  vocabulary: readonly string[],
): Promise<string> => detokenizeRnnt(await greedyDecodeRnnt(options), vocabulary);
