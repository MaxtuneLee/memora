import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  SparkleIcon,
  PenNibIcon,
  FileTextIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  SlidersHorizontalIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Persona } from "@/components/persona";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface SuggestionCard {
  icon: React.ElementType;
  title: string;
  description: string;
}

const suggestions: SuggestionCard[] = [
  {
    icon: SparkleIcon,
    title: "Summarize a file",
    description: "Get a quick summary of any uploaded file",
  },
  {
    icon: PenNibIcon,
    title: "Draft a note",
    description: "Write notes from your recordings",
  },
  {
    icon: FileTextIcon,
    title: "Search transcripts",
    description: "Find specific moments in your audio",
  },
  {
    icon: CheckCircleIcon,
    title: "Create action items",
    description: "Extract tasks from your meetings",
  },
];

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="size-1.5 rounded-full bg-zinc-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900">
          <span className="text-[10px] font-bold text-white leading-none">
            M
          </span>
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-zinc-900 text-white"
            : "bg-white/80 text-zinc-800 shadow-sm ring-1 ring-zinc-200/60"
        )}
      >
        {message.content}
      </div>
    </motion.div>
  );
}

export const Component = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "I'm Memora's assistant. This feature is coming soon — I'll be able to help you search through your files, summarize recordings, and much more.",
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleSuggestionClick = (suggestion: SuggestionCard) => {
    setInput(suggestion.title);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {hasMessages ? (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900">
                  <span className="text-[10px] font-bold text-white leading-none">
                    M
                  </span>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-2.5 shadow-sm ring-1 ring-zinc-200/60">
                  <TypingIndicator />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4">
            <Persona state="idle" className="size-20" />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              What can I help you with?
            </h1>
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 pb-6">
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleSubmit}>
            <div className="group relative rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm transition-colors focus-within:border-zinc-300 focus-within:shadow-md">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Memora..."
                rows={1}
                className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <PlusIcon className="size-4" weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <SlidersHorizontalIcon className="size-4" />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full transition-all",
                    input.trim()
                      ? "bg-zinc-900 text-white hover:bg-zinc-800"
                      : "bg-zinc-200 text-zinc-400"
                  )}
                >
                  <ArrowUpIcon className="size-3.5" weight="bold" />
                </button>
              </div>
            </div>
          </form>

          <AnimatePresence>
            {!hasMessages && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="mt-4 grid grid-cols-2 gap-2.5"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200/60 bg-white/60 px-3.5 py-3 text-left transition-all hover:border-zinc-300 hover:bg-white/90 hover:shadow-sm"
                  >
                    <suggestion.icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-700">
                        {suggestion.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400 leading-snug">
                        {suggestion.description}
                      </p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
