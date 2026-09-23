import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Slider } from "@base-ui/react/slider";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { formatDuration } from "@/lib/format";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxShadow: tokens.shadowSmall,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
  },
  hidden: { display: "none" },
  row: { alignItems: "center", display: "flex", gap: 12 },
  playButton: {
    alignItems: "center",
    backgroundColor: tokens.primaryBackground,
    borderRadius: 9999,
    boxShadow: tokens.shadowSmall,
    color: tokens.primaryText,
    display: "flex",
    height: 40,
    justifyContent: "center",
    transition: "transform 150ms",
    width: 40,
    ":active": { transform: "scale(0.95)" },
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.focusRing}` },
  },
  icon: { height: 16, width: 16 },
  body: { flex: 1 },
  times: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: 12,
    justifyContent: "space-between",
  },
  slider: { marginTop: 8 },
  control: {
    alignItems: "center",
    display: "flex",
    paddingBlock: 8,
    touchAction: "none",
    userSelect: "none",
    width: "100%",
  },
  track: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    boxShadow: `0 0 0 1px ${tokens.border} inset`,
    height: 4,
    position: "relative",
    userSelect: "none",
    width: "100%",
  },
  indicator: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: 9999,
    height: "100%",
    transition: "width 200ms",
    userSelect: "none",
  },
  thumb: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 9999,
    boxShadow: tokens.shadowSmall,
    height: 12,
    outline: "none",
    userSelect: "none",
    width: 12,
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.focusRing}` },
  },
});

interface RecordingPlayerProps {
  audioRef: React.Ref<HTMLAudioElement>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export const RecordingPlayer = ({
  audioRef,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
}: RecordingPlayerProps) => {
  const clampedTime = Math.min(currentTime, duration || 0);

  return (
    <div {...stylex.props(styles.root)}>
      <audio ref={audioRef} {...stylex.props(styles.hidden)} />
      <div {...stylex.props(styles.row)}>
        <Button
          onClick={onTogglePlay}
          {...stylex.props(styles.playButton)}
          aria-label={isPlaying ? "Pause playback" : "Play recording"}
        >
          {isPlaying ? (
            <PauseIcon className={stylex.props(styles.icon).className} />
          ) : (
            <PlayIcon className={stylex.props(styles.icon).className} />
          )}
        </Button>
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.times)}>
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
          <Slider.Root
            value={clampedTime}
            min={0}
            max={duration || 0}
            step={0.1}
            onValueChange={(value) => onSeek(Number(value))}
            className={stylex.props(styles.slider).className}
            aria-label="Seek recording"
          >
            <Slider.Control className={stylex.props(styles.control).className}>
              <Slider.Track className={stylex.props(styles.track).className}>
                <Slider.Indicator className={stylex.props(styles.indicator).className} />
                <Slider.Thumb className={stylex.props(styles.thumb).className} aria-label="Seek" />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
        </div>
      </div>
    </div>
  );
};
