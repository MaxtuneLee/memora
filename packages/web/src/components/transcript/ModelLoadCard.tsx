import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  text: { color: "#52525b", fontSize: 14, margin: 0, textAlign: "center" },
  button: {
    backgroundColor: "#18181b",
    borderRadius: 6,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    paddingBlock: 10,
    paddingInline: 16,
    transition: "transform 150ms, background-color 150ms",
    width: "100%",
    ":active": { transform: "scale(0.95)" },
    ":hover": { backgroundColor: "#27272a" },
    ":focus-visible": { boxShadow: "0 0 0 2px #18181b, 0 0 0 4px #fff" },
    ":disabled": { backgroundColor: "#f4f4f5", color: "#a1a1aa", cursor: "not-allowed" },
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
