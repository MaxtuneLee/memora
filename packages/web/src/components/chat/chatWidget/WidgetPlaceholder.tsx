import { formatStreamFootprint } from "./constants";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../../../styles/stylex.stylex";

const pulse = stylex.keyframes({ "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.5 } });
const ping = stylex.keyframes({ "75%, 100%": { opacity: 0, transform: "scale(2)" } });
const styles = stylex.create({
  outer: { padding: 12 },
  card: {
    backgroundColor: `color-mix(in srgb, ${tokens.card} 90%, transparent)`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxShadow: `0 1px 0 color-mix(in srgb, ${tokens.card} 85%, transparent) inset`,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  background: {
    backgroundImage: `radial-gradient(circle at top right, ${tokens.surfaceMuted}, transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${tokens.card} 88%, transparent), color-mix(in srgb, ${tokens.surfaceSoft} 92%, transparent))`,
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
    backgroundColor: `color-mix(in srgb, ${tokens.textSoft} 80%, transparent)`,
    borderRadius: 9999,
    inset: 0,
    position: "absolute",
  },
  signalDot: {
    backgroundColor: tokens.textMuted,
    borderRadius: 9999,
    height: 10,
    position: "relative",
    width: 10,
  },
  title: {
    color: tokens.textStrong,
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footprint: {
    backgroundColor: `color-mix(in srgb, ${tokens.surfaceMuted} 90%, transparent)`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 9999,
    color: tokens.textMuted,
    flexShrink: 0,
    fontFamily: "monospace",
    fontSize: 10,
    paddingBlock: 4,
    paddingInline: 8,
  },
  detail: { color: tokens.textMuted, fontSize: 12, lineHeight: "20px", margin: 0 },
  skeletons: { display: "flex", flexDirection: "column", gap: 8 },
  pulse: { animationDuration: "2s", animationIterationCount: "infinite", animationName: pulse },
  shortLine: {
    backgroundColor: `color-mix(in srgb, ${tokens.border} 80%, transparent)`,
    borderRadius: 9999,
    height: 10,
    width: "41.666667%",
  },
  surface: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${tokens.surfaceMuted} 92%, transparent), color-mix(in srgb, ${tokens.card} 98%, transparent))`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 20,
    height: 80,
  },
  buttons: { display: "flex", gap: 8 },
  firstButton: {
    backgroundColor: `color-mix(in srgb, ${tokens.border} 80%, transparent)`,
    borderRadius: 12,
    height: 32,
    width: 96,
  },
  secondButton: { backgroundColor: tokens.surfaceMuted, borderRadius: 12, height: 32, width: 80 },
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
