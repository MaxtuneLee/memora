import type {
  TranscriptionEvent,
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptSegment,
} from "./types";

export const transcribePcm = async (
  provider: TranscriptionProvider,
  audio: Float32Array,
  options: Omit<TranscriptionOptions, "segmentation">,
  onProgress?: (progress: number) => void,
  onEvent?: (event: TranscriptionEvent) => void,
): Promise<TranscriptSegment[]> => {
  const segments = new Map<string, TranscriptSegment>();
  const session = await provider.open({ ...options, segmentation: "manual" }, (event) => {
    onEvent?.(event);
    if (event.type !== "segment") return;
    const previous = segments.get(event.segment.id);
    if (!previous || event.segment.revision > previous.revision)
      segments.set(event.segment.id, event.segment);
  });
  try {
    const frameSize = Math.max(1, Math.floor(options.sampleRate / 10));
    let sinceCommit = 0;
    for (let offset = 0; offset < audio.length; offset += frameSize) {
      options.signal?.throwIfAborted();
      const frame = audio.subarray(offset, offset + frameSize);
      await session.write(frame);
      sinceCommit += frame.length;
      if (sinceCommit >= options.sampleRate * 20) {
        await session.commit?.();
        sinceCommit = 0;
      }
      onProgress?.(Math.min(1, (offset + frame.length) / audio.length));
    }
    await session.finish();
    options.signal?.throwIfAborted();
    return [...segments.values()].filter((segment) => segment.isFinal);
  } finally {
    session.abort();
  }
};
