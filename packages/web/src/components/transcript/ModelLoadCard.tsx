import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";

import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  text: { color: tokens.textMuted, fontSize: 14, margin: 0, textAlign: "center" },
  button: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: 6,
    boxShadow: tokens.shadowSmall,
    color: tokens.primaryText,
    fontSize: 14,
    fontWeight: 500,
    paddingBlock: 10,
    paddingInline: 16,
    transition: "transform 150ms, background-color 150ms",
    width: "100%",
    ":active": { transform: "scale(0.95)" },
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens.primaryBackground}, 0 0 0 4px ${tokens.surface}`,
    },
    ":disabled": {
      backgroundColor: tokens.controlDisabledBackground,
      color: tokens.controlDisabledText,
      cursor: "not-allowed",
    },
  },
});

interface ModelLoadCardProps {
  disabled: boolean;
  onLoad: () => void;
}

export const ModelLoadCard = ({ disabled, onLoad }: ModelLoadCardProps) => {
  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.text)}>Load the transcription model before recording.</p>
      <Button
        className={stylex.props(styles.button).className}
        onClick={onLoad}
        disabled={disabled}
      >
        Load Model
      </Button>
    </div>
  );
};
