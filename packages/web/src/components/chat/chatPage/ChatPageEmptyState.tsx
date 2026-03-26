import { AnimatePresence, motion } from "motion/react";
import { GearIcon } from "@phosphor-icons/react";
import { Persona } from "@/components/assistant/Persona";
import { suggestions } from "./helpers";
import type { SuggestionCard } from "./types";

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
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        {sessionsError && <p className="text-center text-xs text-red-600">{sessionsError}</p>}
        <Persona state="idle" className="size-20" />
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{greetingTitle}</h1>
        {!isConfigured && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 transition hover:bg-amber-100"
          >
            <GearIcon className="size-4" />
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
          className="mt-8 grid w-full grid-cols-2 gap-2.5"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="flex items-start gap-3 rounded-xl border border-zinc-200/60 bg-white/60 px-3.5 py-3 text-left transition-all hover:border-zinc-300 hover:bg-white/90 hover:shadow-sm"
            >
              <suggestion.icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-700">{suggestion.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-zinc-400">
                  {suggestion.description}
                </p>
              </div>
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
