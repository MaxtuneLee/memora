import { useId, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";

import { tokens } from "../../styles/stylex.stylex";

const FOCUS_RING = `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.textStrong}`;

const styles = stylex.create({
  card: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 20,
    boxShadow: tokens.shadowLarge,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    width: "min(400px, calc(100vw - 32px))",
  },
  image: {
    aspectRatio: "16 / 9",
    display: "block",
    objectFit: "cover",
    width: "100%",
  },
  body: { display: "flex", flexDirection: "column", gap: 16, padding: 24 },
  title: { color: tokens.textStrong, fontSize: 18, fontWeight: 600, margin: 0 },
  description: { color: tokens.textMuted, fontSize: 14, lineHeight: 1.5, margin: 0, marginTop: 6 },
  error: { color: tokens.textStrong, fontSize: 13, lineHeight: 1.5, margin: 0 },
  actions: { display: "flex", flexDirection: "column", gap: 8 },
  primary: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: 10,
    color: tokens.primaryText,
    fontSize: 14,
    fontWeight: 500,
    paddingBlock: 10,
    transition: "opacity 150ms",
    ":disabled": { opacity: 0.6 },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
  secondary: {
    borderRadius: 8,
    color: tokens.textMuted,
    fontSize: 13,
    paddingBlock: 6,
    ":hover": { color: tokens.textStrong },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
});

interface PasskeyLockCardProps {
  title: string;
  description: string;
  actionLabel: string;
  busy: boolean;
  error?: string;
  onAction: () => void;
  secondary?: ReactNode;
}

export default function PasskeyLockCard({
  title,
  description,
  actionLabel,
  busy,
  error,
  onAction,
  secondary,
}: PasskeyLockCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} {...stylex.props(styles.card)}>
      <img src="/protection.webp" alt="" width={960} height={540} {...stylex.props(styles.image)} />
      <div {...stylex.props(styles.body)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            {title}
          </h2>
          <p {...stylex.props(styles.description)}>{description}</p>
        </div>
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            disabled={busy}
            onClick={onAction}
            {...stylex.props(styles.primary)}
          >
            {busy ? "Waiting for passkey…" : actionLabel}
          </button>
          {secondary}
        </div>
      </div>
    </section>
  );
}

export const passkeySecondaryButtonClassName = stylex.props(styles.secondary).className;
