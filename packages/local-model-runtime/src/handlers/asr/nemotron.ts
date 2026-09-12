import type { LocalAsrEvent, LocalAsrRequest, LocalAsrStreamOpenRequest } from "../../types";
import { NemotronStreamingDecoder } from "./nemotron/decoder";
import { loadNemotronSessions } from "./nemotron/sessions";
import { SAMPLE_RATE } from "./nemotron/features";
import { inverseNormalizeNemotronTranscript } from "./nemotron/itn";
import { resolveNemotronLanguageId } from "./nemotron/language";

export interface NemotronStreamChunk {
  audio: Float32Array;
  acknowledge: () => void;
}

export interface NemotronStreamSource {
  nextChunk: () => Promise<NemotronStreamChunk | null>;
}

export const runNemotronTranscription = async (
  request: LocalAsrRequest,
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => {
  const sessions = await loadNemotronSessions(emit);
  const decoder = new NemotronStreamingDecoder(
    sessions,
    resolveNemotronLanguageId(request.language),
  );
  emit({ type: "status", status: "running" });
  await decoder.push(request.audio);
  await decoder.flush();
  const transcript = inverseNormalizeNemotronTranscript(
    decoder.text,
    request.returnTimestamps === "word"
      ? decoder.timestampedWords(request.audio.length / SAMPLE_RATE)
      : undefined,
  );
  emit({
    type: "transcript-complete",
    text: transcript.text,
    chunks: transcript.words,
    audioLength: request.audio.length,
  });
};

export const runNemotronStream = async (
  request: LocalAsrStreamOpenRequest,
  stream: NemotronStreamSource,
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => {
  const sessions = await loadNemotronSessions(emit);
  const decoder = new NemotronStreamingDecoder(
    sessions,
    resolveNemotronLanguageId(request.language),
  );
  emit({ type: "status", status: "running" });
  let audioLength = 0;
  for (let chunk = await stream.nextChunk(); chunk; chunk = await stream.nextChunk()) {
    audioLength += chunk.audio.length;
    await decoder.push(chunk.audio);
    chunk.acknowledge();
    emit({ type: "transcript-delta", text: decoder.text });
  }
  await decoder.flush();
  const transcript = inverseNormalizeNemotronTranscript(
    decoder.text,
    decoder.timestampedWords(audioLength / SAMPLE_RATE),
  );
  emit({
    type: "transcript-complete",
    text: transcript.text,
    chunks: transcript.words,
    audioLength,
  });
};
