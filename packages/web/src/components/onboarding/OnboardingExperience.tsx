import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { ArrowLeftIcon, ArrowRightIcon, SignOutIcon, SparkleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import MemoraMascot, { type MemoraMascotState } from "@/components/assistant/MemoraMascot";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";

export type OnboardingApiFormat = "chat-completions" | "responses";

export interface OnboardingProfileInput {
  endpoint: string;
  apiKey: string;
  model: string;
  apiFormat: OnboardingApiFormat;
  name: string;
  primaryUseCase: string;
  assistantStyle: string;
}

interface OnboardingExperienceProps {
  isSaving: boolean;
  errorMessage: string | null;
  streamingSoulDocument: string;
  onComplete: (input: OnboardingProfileInput) => Promise<void>;
}

const TOTAL_STEPS = 3;

export default function OnboardingExperience({
  isSaving,
  errorMessage,
  streamingSoulDocument,
  onComplete,
}: OnboardingExperienceProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState(1);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [apiFormat, setApiFormat] = useState<OnboardingApiFormat>("chat-completions");
  const [name, setName] = useState("");
  const [primaryUseCase, setPrimaryUseCase] = useState("");
  const [assistantStyle, setAssistantStyle] = useState("");

  const canContinue = useMemo(() => {
    if (step === 1) {
      return !!endpoint.trim() && !!apiKey.trim() && !!model.trim();
    }
    if (step === 2) {
      return !!name.trim() && !!primaryUseCase.trim() && !!assistantStyle.trim();
    }
    return true;
  }, [apiKey, assistantStyle, endpoint, model, name, primaryUseCase, step]);

  const mascotState = useMemo<MemoraMascotState>(() => {
    if (step === 1) return "listening";
    if (step === 2) return "thinking";
    return "idle";
  }, [step]);

  const helperText = useMemo(() => {
    if (step === 1) {
      return "Start by sharing your model endpoint. I will use these exact credentials to write my Soul Document with you.";
    }
    if (step === 2) {
      return "Now describe who you are, what this space is for, and how you want me to speak with you.";
    }
    return "Generate your Soul Document. Onboarding only finishes after AI generation succeeds.";
  }, [step]);

  const handleContinue = async () => {
    if (!canContinue || isSaving) {
      return;
    }

    if (step < TOTAL_STEPS) {
      setStep((current) => current + 1);
      return;
    }

    await onComplete({
      endpoint: endpoint.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      apiFormat,
      name: name.trim().replace(/\s+/g, " "),
      primaryUseCase: primaryUseCase.trim(),
      assistantStyle: assistantStyle.trim(),
    });
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[#f5efe2] px-4 py-8 text-[#211c16] sm:px-6 lg:px-12">
      <section className="w-full max-w-5xl">
        <header className="px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#63594d] transition hover:text-[#443d33]"
          >
            <SignOutIcon className="size-4" weight="bold" />
            Not now
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#7d7361] uppercase">
                Memora onboarding
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#201b16] sm:text-3xl">
                Before we start chatting, let me get to know you better.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#61574a]">
                Share your setup and preferences first, and I will shape each conversation around
                how you think, work, and want to be supported.
              </p>
            </div>
            <div className="hidden text-[11px] font-semibold tracking-[0.16em] text-[#766b58] uppercase sm:block">
              Step {step} / {TOTAL_STEPS}
            </div>
          </div>

          <div className="mt-4 h-1.5 rounded-full bg-[#e5dccb]">
            <motion.div
              className="h-full rounded-full bg-[#77894a]"
              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              transition={{
                duration: prefersReducedMotion ? 0.12 : 0.32,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>
        </header>

        <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-10">
          <aside className="space-y-4">
            <div className="inline-flex items-center gap-2 px-1 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#5f7434] uppercase">
              <SparkleIcon className="size-3" weight="fill" />
              I'm Momo. I'm here to help.
            </div>
            <div className="p-1">
              <div className="flex items-center gap-3">
                <MemoraMascot state={mascotState} className="size-14" />
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-[#786d5b] uppercase">
                    How I align with you
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#5f5548]">{helperText}</p>
                </div>
              </div>
            </div>
          </aside>

          <motion.div
            key={step}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {step === 1 ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight text-[#1f1a15]">
                  Step 1 · Provider setup
                </h2>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    Endpoint
                  </span>
                  <input
                    autoFocus
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className="w-full rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    API key
                  </span>
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    Model
                  </span>
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="gpt-4.1-mini"
                    className="w-full rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    API format
                  </p>
                  <div className="flex gap-2">
                    {(["chat-completions", "responses"] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setApiFormat(format)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                          apiFormat === format
                            ? "border-[#1f1a15] bg-[#1f1a15] text-[#f8f1e3]"
                            : "border-[#dacfbf] bg-[#fff8ed] text-[#675d50] hover:border-[#b9ab95]"
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight text-[#1f1a15]">
                  Step 2 · Identity inputs
                </h2>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    Your name
                  </span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="What should I call you?"
                    className="w-full rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    Primary use case
                  </span>
                  <textarea
                    value={primaryUseCase}
                    onChange={(event) => setPrimaryUseCase(event.target.value)}
                    rows={3}
                    placeholder="What do you mainly want Memora to help with?"
                    className="w-full resize-none rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                    Assistant style
                  </span>
                  <textarea
                    value={assistantStyle}
                    onChange={(event) => setAssistantStyle(event.target.value)}
                    rows={3}
                    placeholder="How should I respond to you day to day?"
                    className="w-full resize-none rounded-2xl border border-[#dfd5c3] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#1d1814] outline-none transition placeholder:text-[#9a8f7d] focus:border-[#879a4f] focus:ring-2 focus:ring-[#879a4f]/20"
                  />
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight text-[#1f1a15]">
                  Step 3 · Generate Soul Document
                </h2>
                <p className="text-sm leading-relaxed text-[#605648]">
                  I will now generate a first-person Soul Document grounded in your values,
                  boundaries, and relationship context. If generation fails, onboarding stays here
                  until it succeeds.
                </p>
                <AnimatePresence mode="wait" initial={false}>
                  {isSaving ? (
                    <motion.div
                      key="stream"
                      initial={
                        prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.995 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={
                        prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.995 }
                      }
                      transition={{ duration: prefersReducedMotion ? 0.12 : 0.28 }}
                      className="space-y-2 px-0.5"
                    >
                      <p className="text-xs font-semibold tracking-[0.08em] text-[#726754] uppercase">
                        Soul Document stream
                      </p>
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-[#ddd2c1] bg-[#fff8ee] p-3 text-sm text-[#3f372f]">
                        <Streamdown
                          parseIncompleteMarkdown
                          mode="streaming"
                          className={MEMORA_STREAMDOWN_CLASS_NAME}
                          controls={MEMORA_STREAMDOWN_CONTROLS}
                          plugins={MEMORA_STREAMDOWN_PLUGINS}
                          shikiTheme={MEMORA_STREAMDOWN_THEME}
                        >
                          {streamingSoulDocument || "Generating Soul Document..."}
                        </Streamdown>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="summary"
                      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: prefersReducedMotion ? 0.12 : 0.24 }}
                      className="space-y-2 px-0.5 text-sm text-[#4f473c]"
                    >
                      <p>
                        <span className="font-semibold text-[#342d25]">Endpoint:</span>{" "}
                        {endpoint.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#342d25]">Model:</span> {model.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#342d25]">API format:</span>{" "}
                        {apiFormat}
                      </p>
                      <p>
                        <span className="font-semibold text-[#342d25]">Name:</span> {name.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#342d25]">Use case:</span>{" "}
                        {primaryUseCase.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#342d25]">Assistant style:</span>{" "}
                        {assistantStyle.trim()}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : null}

            {errorMessage ? <p className="px-0.5 text-xs text-[#9a3b3b]">{errorMessage}</p> : null}

            <div className="flex items-center justify-between pt-1">
              <motion.button
                type="button"
                disabled={step === 1 || isSaving}
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                whileHover={
                  prefersReducedMotion || step === 1 || isSaving
                    ? undefined
                    : { y: -1, scale: 1.01 }
                }
                whileTap={
                  prefersReducedMotion || step === 1 || isSaving ? undefined : { scale: 0.98 }
                }
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d5cab8] bg-[#fff8ec] px-3.5 py-1.5 text-xs font-medium text-[#63594d] transition hover:border-[#b8aa94] hover:text-[#443d33] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeftIcon className="size-3.5" weight="bold" />
                Back
              </motion.button>

              <motion.button
                type="button"
                onClick={() => void handleContinue()}
                disabled={!canContinue || isSaving}
                whileHover={
                  prefersReducedMotion || !canContinue || isSaving
                    ? undefined
                    : { y: -1, scale: 1.01 }
                }
                whileTap={
                  prefersReducedMotion || !canContinue || isSaving ? undefined : { scale: 0.98 }
                }
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1f1a15] px-4 py-2 text-xs font-semibold text-[#f8f1e3] transition hover:bg-[#322b23] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === TOTAL_STEPS
                  ? isSaving
                    ? "Generating..."
                    : "Generate Soul Document"
                  : "Continue"}
                <ArrowRightIcon className="size-3.5" weight="bold" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
