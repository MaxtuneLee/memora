import { formatStreamFootprint } from "./constants";
import * as stylex from "@stylexjs/stylex";

const pulse = stylex.keyframes({ "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.5 } });
const ping = stylex.keyframes({ "75%, 100%": { opacity: 0, transform: "scale(2)" } });
const styles = stylex.create({
  outer: { padding: 12 },
  card: {
    backgroundColor: "rgb(255 255 255 / 0.9)",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    boxShadow: "0 1px 0 rgb(255 255 255 / 0.85) inset",
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  background: {
    backgroundImage:
      "radial-gradient(circle at top right, rgba(244,244,245,0.95), transparent 55%), linear-gradient(180deg,rgba(255,255,255,0.88),rgba(250,250,249,0.92))",
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  content: { display: "flex", flexDirection: "column", gap: 12, position: "relative" },
  header: { alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" },
  titleWrap: { alignItems: "center", display: "flex", flex: 1, gap: 8, minWidth: 0 },
  signal: { display: "flex", flexShrink: 0, height: 10, position: "relative", width: 10 },
  signalPing: {
    animationName: ping,
    animationDuration: "1s",
    animationIterationCount: "infinite",
    backgroundColor: "rgb(212 212 216 / 0.8)",
    borderRadius: 9999,
    inset: 0,
    position: "absolute",
  },
  signalDot: {
    backgroundColor: "#52525b",
    borderRadius: 9999,
    height: 10,
    position: "relative",
    width: 10,
  },
  title: {
    color: "#18181b",
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footprint: {
    backgroundColor: "rgb(244 244 245 / 0.9)",
    border: "1px solid #e4e4e7",
    borderRadius: 9999,
    color: "#71717a",
    flexShrink: 0,
    fontFamily: "monospace",
    fontSize: 10,
    paddingBlock: 4,
    paddingInline: 8,
  },
  detail: { color: "#71717a", fontSize: 12, lineHeight: "20px", margin: 0 },
  skeletons: { display: "flex", flexDirection: "column", gap: 8 },
  pulse: { animationDuration: "2s", animationIterationCount: "infinite", animationName: pulse },
  shortLine: {
    backgroundColor: "rgb(228 228 231 / 0.8)",
    borderRadius: 9999,
    height: 10,
    width: "41.666667%",
  },
  surface: {
    backgroundImage: "linear-gradient(135deg,rgba(244,244,245,0.92),rgba(255,255,255,0.98))",
    border: "1px solid rgb(228 228 231 / 0.8)",
    borderRadius: 20,
    height: 80,
  },
  buttons: { display: "flex", gap: 8 },
  firstButton: {
    backgroundColor: "rgb(228 228 231 / 0.8)",
    borderRadius: 12,
    height: 32,
    width: 96,
  },
  secondButton: { backgroundColor: "#f4f4f5", borderRadius: 12, height: 32, width: 80 },
});

export const WidgetPlaceholder = ({
  title,
  detail,
  widgetCodeLength,
}: {
  title: string;
  detail: string;
  widgetCodeLength: number;
}) => {
  return (
    <div {...stylex.props(styles.outer)}>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.background)} />
        <div {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.titleWrap)}>
              <span {...stylex.props(styles.signal)}>
                <span {...stylex.props(styles.signalPing)} />
                <span {...stylex.props(styles.signalDot)} />
              </span>
              <p {...stylex.props(styles.title)}>{title}</p>
            </div>
            {widgetCodeLength > 0 && (
              <span {...stylex.props(styles.footprint)}>
                {formatStreamFootprint(widgetCodeLength)}
              </span>
            )}
          </div>
          <p {...stylex.props(styles.detail)}>{detail}</p>
          <div {...stylex.props(styles.skeletons)}>
            <div {...stylex.props(styles.shortLine, styles.pulse)} />
            <div {...stylex.props(styles.surface, styles.pulse)} />
            <div {...stylex.props(styles.buttons)}>
              <div {...stylex.props(styles.firstButton, styles.pulse)} />
              <div {...stylex.props(styles.secondButton, styles.pulse)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
