import { motion } from "motion/react";
import { GearIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { Persona } from "@/components/assistant/Persona";
import { tokens } from "../../../styles/stylex.stylex";
import { CHAT_LAYOUT_TRANSITION } from "./layout";

const styles = stylex.create({
  root: { flex: 1 },
  // Anchored to the same box as the centered composer (the chat content area, which is the
  // nearest positioned ancestor) so the greeting always ends right above the composer's top edge.
  top: {
    alignItems: "center",
    bottom: "50%",
    display: "flex",
    flexDirection: "column",
    insetInline: 0,
    paddingBottom: 24,
    position: "absolute",
    textAlign: "center",
  },
  hero: { alignItems: "center", display: "flex", flexDirection: "column", gap: 16 },
  error: { color: tokens.dangerText, fontSize: 12, textAlign: "center" },
  persona: { height: 80, width: 80 },
  personaFill: { height: "100%", width: "100%" },
  title: { color: tokens.textStrong, fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em" },
  configure: {
    alignItems: "center",
    backgroundColor: tokens.warningSurface,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 12,
    color: tokens.warningText,
    display: "flex",
    fontSize: 14,
    gap: 8,
    paddingBlock: 10,
    paddingInline: 16,
    transition: "background-color 150ms",
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.warningSurface} 60%, ${tokens.warningBorder})`,
    },
  },
  icon: { height: 16, width: 16 },
});

interface ChatPageEmptyStateProps {
  greetingTitle: string;
  isConfigured: boolean;
  mascotLayoutId: string;
  sessionsError: string | null;
  onOpenSettings: () => void;
}

export const ChatPageEmptyState = ({
  greetingTitle,
  isConfigured,
  mascotLayoutId,
  sessionsError,
  onOpenSettings,
}: ChatPageEmptyStateProps) => {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.top)}>
        <div {...stylex.props(styles.hero)}>
          {sessionsError && <p {...stylex.props(styles.error)}>{sessionsError}</p>}
          <motion.div
            layoutId={mascotLayoutId}
            transition={CHAT_LAYOUT_TRANSITION}
            {...stylex.props(styles.persona)}
          >
            <Persona state="idle" style={styles.personaFill} />
          </motion.div>
          <h1 {...stylex.props(styles.title)}>{greetingTitle}</h1>
          {!isConfigured && (
            <button type="button" onClick={onOpenSettings} {...stylex.props(styles.configure)}>
              <GearIcon className={stylex.props(styles.icon).className} />
              Configure an AI provider to get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
