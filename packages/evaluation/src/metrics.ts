import type { EditCounts, MetricScore, NormalizationProfile, TextScore } from "./types";

export const DEFAULT_NORMALIZATION_PROFILE: NormalizationProfile = {
  id: "memora-text-default",
  version: 1,
  unicode: "NFC",
  whitespace: "trim-and-collapse",
  caseSensitive: false,
  punctuation: "strip",
};

export const normalizeText = (text: string): string =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\p{P}/gu, "")
    .trim()
    .replace(/\s+/gu, " ");

const editDistance = (reference: string[], prediction: string[]): EditCounts => {
  type Cell = EditCounts & { edits: number };
  let previous: Cell[] = prediction.map((_, index) => ({
    edits: index + 1,
    insertions: index + 1,
    deletions: 0,
    substitutions: 0,
  }));
  previous.unshift({ edits: 0, insertions: 0, deletions: 0, substitutions: 0 });

  for (let referenceIndex = 0; referenceIndex < reference.length; referenceIndex += 1) {
    const current: Cell[] = [
      {
        edits: referenceIndex + 1,
        insertions: 0,
        deletions: referenceIndex + 1,
        substitutions: 0,
      },
    ];
    for (let predictionIndex = 0; predictionIndex < prediction.length; predictionIndex += 1) {
      if (reference[referenceIndex] === prediction[predictionIndex]) {
        current.push(previous[predictionIndex]);
        continue;
      }
      const candidates: Cell[] = [
        {
          ...current[predictionIndex],
          edits: current[predictionIndex].edits + 1,
          insertions: current[predictionIndex].insertions + 1,
        },
        {
          ...previous[predictionIndex + 1],
          edits: previous[predictionIndex + 1].edits + 1,
          deletions: previous[predictionIndex + 1].deletions + 1,
        },
        {
          ...previous[predictionIndex],
          edits: previous[predictionIndex].edits + 1,
          substitutions: previous[predictionIndex].substitutions + 1,
        },
      ];
      current.push(
        candidates.reduce((best, candidate) => (candidate.edits < best.edits ? candidate : best)),
      );
    }
    previous = current;
  }
  const result = previous.at(-1) ?? { insertions: 0, deletions: 0, substitutions: 0 };
  return {
    insertions: result.insertions,
    deletions: result.deletions,
    substitutions: result.substitutions,
  };
};

const metric = (reference: string[], prediction: string[]): MetricScore => {
  const counts = editDistance(reference, prediction);
  const edits = counts.insertions + counts.deletions + counts.substitutions;
  return {
    ...counts,
    edits,
    referenceUnits: reference.length,
    value: reference.length === 0 ? null : edits / reference.length,
    ...(reference.length === 0 ? { reason: "zero-reference-units" as const } : {}),
  };
};

export const scoreText = (reference: string, prediction: string): TextScore => {
  const normalizedReference = normalizeText(reference);
  const normalizedPrediction = normalizeText(prediction);
  return {
    profile: DEFAULT_NORMALIZATION_PROFILE,
    reference: { raw: reference, normalized: normalizedReference },
    prediction: { raw: prediction, normalized: normalizedPrediction },
    wer: metric(
      normalizedReference ? normalizedReference.split(" ") : [],
      normalizedPrediction ? normalizedPrediction.split(" ") : [],
    ),
    cer: metric(
      Array.from(normalizedReference).filter((character) => !/\s/u.test(character)),
      Array.from(normalizedPrediction).filter((character) => !/\s/u.test(character)),
    ),
  };
};
