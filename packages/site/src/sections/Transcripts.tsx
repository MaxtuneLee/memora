import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";

import { RecordingPreviewSurface } from "@web/components/transcript/transcriptDetail/RecordingPreviewSurface";
import { TranscriptSection } from "@web/components/transcript/transcriptDetail/TranscriptSection";
import {
  buildSrt,
  downloadText,
  searchTranscript,
} from "@web/lib/transcript/transcriptSearchExport";
import type { RecordingItem } from "@web/types/library";

import { TRANSCRIPT_DURATION, TRANSCRIPT_WORDS } from "../mock/data";

const NAME = "Physics 101 · Satellites";
const TEXT = TRANSCRIPT_WORDS.map((w) => w.text)
  .join("")
  .trim();
const noop = (): void => {};
const RECORDING_BYTES = 418_618;
const CREATED_AT = Date.UTC(2026, 8, 22, 15, 0);

// The app's real transcript page pieces: the audio player with its waveform, and the
// word-aligned transcript with search and export, on a real sample recording.
export function Transcripts(): ReactElement {
  const recording: RecordingItem = {
    id: "physics-satellites",
    name: NAME,
    type: "audio",
    mimeType: "audio/wav",
    sizeBytes: RECORDING_BYTES,
    storageType: "opfs",
    storagePath: "/files/physics-satellites",
    metaPath: "/files/physics-satellites.json",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    durationSec: TRANSCRIPT_DURATION,
    audioUrl: "/sample-recording.wav",
  };

  const currentTimeRef = useRef(0);
  const seekRef = useRef<number | null>(null);
  const [readyToken, setReadyToken] = useState(0);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  const matches = useMemo(
    () => searchTranscript({ query, text: TEXT, words: TRANSCRIPT_WORDS }),
    [query],
  );
  const seek = useCallback((time: number) => {
    seekRef.current = time;
  }, []);
  const jumpToMatch = useCallback(
    (next: number) => {
      if (!matches.length) return;
      const i = ((next % matches.length) + matches.length) % matches.length;
      setActiveMatch(i);
      const start = matches[i].startSec;
      if (start !== null) seek(start);
    },
    [matches, seek],
  );

  return (
    <section className="section" id="transcripts">
      <div className="wrap">
        <div className="head reveal">
          <h2>
            <em>Word level</em> transcription
          </h2>
          <p className="lede">
            Transcripts are aligned word by word. Play the recording and the text follows; click a
            word, or search, to jump to that moment.
          </p>
        </div>
        <div className="tx-page reveal">
          <RecordingPreviewSurface
            recording={recording}
            mediaReadyToken={readyToken}
            transcriptWords={TRANSCRIPT_WORDS}
            currentTimeRef={currentTimeRef}
            seekRef={seekRef}
            onMediaReady={() => setReadyToken((t) => t + 1)}
          />
          <div className="tx-transcript">
            <TranscriptSection
              showTranscript
              hasSearchableTranscript
              hasTranscript
              isTranscribing={false}
              canExportSrt
              canSearch
              transcriptText={TEXT}
              transcriptWords={TRANSCRIPT_WORDS}
              transcriptionStatus="idle"
              transcriptionProgress={0}
              currentTimeRef={currentTimeRef}
              searchQuery={query}
              activeMatchIndex={activeMatch}
              searchMatches={matches}
              manualTranscript=""
              isSavingManual={false}
              onSearchQueryChange={(q) => {
                setQuery(q);
                setActiveMatch(0);
              }}
              onJumpToMatch={jumpToMatch}
              onManualTranscriptChange={noop}
              onExportTxt={() => downloadText(TEXT, `${NAME}.txt`)}
              onExportSrt={() =>
                downloadText(
                  buildSrt(TRANSCRIPT_WORDS),
                  `${NAME}.srt`,
                  "application/x-subrip;charset=utf-8",
                )
              }
              onTranscriptToggle={noop}
              onSaveManualTranscript={noop}
              onSeek={seek}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
