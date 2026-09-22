import { AnimatePresence, motion } from "motion/react";
import { GearIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { Persona } from "@/components/assistant/Persona";
import { tokens } from "../../../styles/stylex.stylex";
import { suggestions } from "./helpers";
import type { SuggestionCard } from "./types";

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    paddingBlock: 40,
    textAlign: "center",
  },
  hero: { alignItems: "center", display: "flex", flexDirection: "column", gap: 16 },
  error: { color: tokens.dangerText, fontSize: 12, textAlign: "center" },
  persona: { height: 80, width: 80 },
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
    ":hover": { backgroundColor: `color-mix(in srgb, ${tokens.warningSurface} 60%, ${tokens.warningBorder})` },
  },
  icon: { height: 16, width: 16 },
  suggestions: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    marginTop: 32,
    width: "100%",
  },
  suggestion: {
    alignItems: "flex-start",
    backgroundColor: `color-mix(in srgb, ${tokens.card} 60%, transparent)`,
    border: `1px solid ${tokens.borderSoft}`,
    borderRadius: 12,
    display: "flex",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 14,
    textAlign: "left",
    transition: "all 150ms",
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.card} 90%, transparent)`,
      borderColor: tokens.borderStrong,
      boxShadow: tokens.shadowSmall,
    },
  },
  suggestionIcon: { color: tokens.textSoft, flexShrink: 0, height: 16, marginTop: 2, width: 16 },
  suggestionCopy: { minWidth: 0 },
  suggestionTitle: { color: tokens.textStrong, fontSize: 14, fontWeight: 500 },
  suggestionDescription: { color: tokens.textSoft, fontSize: 12, lineHeight: 1.375, marginTop: 2 },
});

interface ChatPageEmptyStateProps {
  greetingTitle: string;
  isConfigured: boolean;
  sessionsError: string | null;
  onOpenSettings: () => void;
  onSuggestionClick: (suggestion: SuggestionCard) => void;
}

export const ChatPageEmptyState = ({
  greetingTitle,
  isConfigured,
  sessionsError,
  onOpenSettings,
  onSuggestionClick,
}: ChatPageEmptyStateProps) => {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.hero)}>
        {sessionsError && <p {...stylex.props(styles.error)}>{sessionsError}</p>}
        <Persona state="idle" style={styles.persona} />
        <h1 {...stylex.props(styles.title)}>{greetingTitle}</h1>
        {!isConfigured && (
          <button type="button" onClick={onOpenSettings} {...stylex.props(styles.configure)}>
            <GearIcon className={stylex.props(styles.icon).className} />
            Configure an AI provider to get started
          </button>
        )}
      </div>

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          {...stylex.props(styles.suggestions)}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              {...stylex.props(styles.suggestion)}
            >
              <suggestion.icon className={stylex.props(styles.suggestionIcon).className} />
              <div {...stylex.props(styles.suggestionCopy)}>
                <p {...stylex.props(styles.suggestionTitle)}>{suggestion.title}</p>
                <p {...stylex.props(styles.suggestionDescription)}>{suggestion.description}</p>
              </div>
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
