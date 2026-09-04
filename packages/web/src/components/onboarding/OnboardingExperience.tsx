import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Toast } from "@base-ui/react/toast";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router";

import ProviderManagementSection from "@/components/settings/ProviderManagementSection";
import FeatureModelSettings from "@/components/settings/FeatureModelSettings";
import LocalModelDownloadCard from "@/components/settings/LocalModelDownloadCard";
import { cn } from "@/lib/cn";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";
import { useLocalModelDownloadState } from "@/hooks/settings/useLocalModelDownloadSettings";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";
import type { LocalModelOption } from "@/lib/local-model";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { ProviderFormState } from "@/types/settingsDialog";

import {
  buildTailPath,
  createTailAvoidance,
  getActiveTailAvoidances,
  getTailPhase,
  type TailAvoidance,
} from "./onboardingTailMotion";

export interface OnboardingProfileInput {
  name: string;
  primaryUseCase: string;
  assistantStyle: string;
}

interface OnboardingExperienceProps {
  isSaving: boolean;
  errorMessage: string | null;
  streamingSoulDocument: string;
  providers: ProviderRow[];
  getProviderApiKey: (provider: ProviderRow) => string;
  localModelOptions: LocalModelOption[];
  requiredModelsReady: boolean;
  onDownloadLocalModel: (modelId: string) => void;
  onCreateProvider: (providerForm: ProviderFormState) => void;
  onUpdateProvider: (providerId: string, providerForm: ProviderFormState) => void;
  onDeleteProvider: (providerId: string) => void;
  onFetchProviderModels: (provider: ProviderRow) => void | Promise<void>;
  onComplete: (input: OnboardingProfileInput) => Promise<void>;
}

const TOTAL_STEPS = 6;
const PATTERN_MARKS = Array.from({ length: 104 }, (_, index) => index);

const STYLE_TAGS = [
  "concise",
  "direct",
  "patient",
  "research-minded",
  "critical",
  "warm",
  "structured",
  "practical",
] as const;

const USE_CASE_TAGS = [
  "research notes",
  "paper reading",
  "class materials",
  "meeting notes",
  "transcripts",
  "writing drafts",
] as const;

const emptyProviderForm = (): ProviderFormState => ({
  name: "",
  baseUrl: "",
  apiKey: "",
  apiFormat: "chat-completions",
});

const buildTagList = (selectedTags: string[], customTags: string): string => {
  const custom = customTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set([...selectedTags, ...custom])).join(", ");
};

const getStepTitle = (step: number): string => {
  if (step === 1) return "Welcome to Memora";
  if (step === 2) return "Connect a cloud provider";
  if (step === 3) return "Choose where models run";
  if (step === 4) return "Personalize Memora";
  if (step === 5) return "Shape Personality";
  return "Setup Complete";
};

const getStepDescription = (step: number): string => {
  if (step === 1) {
    return "Memora is your personal knowledge base that lives on your device. ";
  }
  if (step === 2) {
    return "Chat uses cloud models. Add a provider now, or set up chat later. API keys stay on this device and are never synced or exported.";
  }
  if (step === 3) {
    return "Choose the model for chat and for creating your assistant profile. Other features can be configured individually in Settings.";
  }
  if (step === 4) {
    return "These details become the seed context for how Memora speaks and helps you work.";
  }
  if (step === 5) {
    return "I will shape my personality based on the following information.";
  }
  return "All set! Memora is now ready to help you capture and organize your knowledge.";
};

function AnimatedTail({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const tailSvgRef = useRef<SVGSVGElement | null>(null);
  const tailPathRef = useRef<SVGPathElement | null>(null);
  const phaseRef = useRef(0);
  const avoidanceRef = useRef<TailAvoidance[]>([]);

  useEffect(() => {
    const path = tailPathRef.current;
    if (!path) return;

    if (prefersReducedMotion) {
      phaseRef.current = 0;
      avoidanceRef.current = [];
      path.setAttribute("d", buildTailPath(0));
      return;
    }

    let frameId = 0;
    let previousTimestamp: number | null = null;
    const animateTail = (timestamp: number): void => {
      if (previousTimestamp !== null) {
        const elapsed = Math.min(timestamp - previousTimestamp, 32);
        phaseRef.current += getTailPhase(elapsed);
      }
      previousTimestamp = timestamp;
      avoidanceRef.current = getActiveTailAvoidances(avoidanceRef.current, timestamp);
      path.setAttribute("d", buildTailPath(phaseRef.current, avoidanceRef.current, timestamp));
      frameId = window.requestAnimationFrame(animateTail);
    };
    frameId = window.requestAnimationFrame(animateTail);

    return () => window.cancelAnimationFrame(frameId);
  }, [prefersReducedMotion]);

  const handleTailPointerDown = (event: PointerEvent<SVGPathElement>): void => {
    if (prefersReducedMotion) return;

    const svg = tailSvgRef.current;
    if (!svg) return;

    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const localPoint = point.matrixTransform(screenMatrix.inverse());
    const timestamp = performance.now();
    const activeAvoidances = getActiveTailAvoidances(avoidanceRef.current, timestamp);
    avoidanceRef.current = [
      ...activeAvoidances,
      createTailAvoidance(
        phaseRef.current,
        [localPoint.x, localPoint.y],
        timestamp,
        activeAvoidances,
      ),
    ];
  };

  return (
    <svg
      ref={tailSvgRef}
      aria-hidden="true"
      className="h-full w-full overflow-visible"
      viewBox="0 0 486 898"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        ref={tailPathRef}
        d={buildTailPath(0)}
        className={prefersReducedMotion ? undefined : "cursor-pointer"}
        stroke="#030302"
        strokeWidth="120"
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={prefersReducedMotion ? undefined : handleTailPointerDown}
      />
    </svg>
  );
}

function BrandPanel() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <aside className="relative hidden h-dvh overflow-hidden bg-[#8fa06f] lg:block">
      <div className="absolute inset-0 opacity-35">
        <div className="grid grid-cols-8 gap-x-10 gap-y-9 p-10">
          {PATTERN_MARKS.map((mark) => (
            <span
              key={mark}
              className="relative block size-5 before:absolute before:left-1/2 before:top-0 before:h-full before:w-[5px] before:-translate-x-1/2 before:rotate-45 before:rounded-full before:bg-[#6f8050] after:absolute after:left-1/2 after:top-0 after:h-full after:w-[5px] after:-translate-x-1/2 after:-rotate-45 after:rounded-full after:bg-[#6f8050]"
            />
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-9rem] h-[26rem] w-[14.08rem] max-w-none -translate-x-[58%] rotate-[16deg]"
      >
        <AnimatedTail prefersReducedMotion={!!prefersReducedMotion} />
      </div>
      <img
        src="/onboarding-assets/logo-text.svg"
        alt="Memora"
        className="absolute left-1/2 top-[44%] w-[min(13.5rem,28vw)] max-w-none -translate-x-1/2 select-none"
      />
      <img
        src="/onboarding-assets/cat-right.svg"
        alt=""
        aria-hidden="true"
        className="absolute bottom-[-10rem] left-1/2 w-[min(30rem,54vw)] max-w-none -translate-x-[48%]"
      />
    </aside>
  );
}

function OnboardingLocalModelDownloadCard({
  model,
  onDownload,
}: {
  model: LocalModelOption;
  onDownload: (modelId: string) => void;
}) {
  const state = useLocalModelDownloadState(model.id);

  return <LocalModelDownloadCard model={model} state={state} onDownload={onDownload} />;
}

export default function OnboardingExperience({
  isSaving,
  errorMessage,
  streamingSoulDocument,
  providers,
  getProviderApiKey,
  localModelOptions,
  requiredModelsReady,
  onDownloadLocalModel,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onFetchProviderModels,
  onComplete,
}: OnboardingExperienceProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { add } = Toast.useToastManager();
  const [step, setStep] = useState(1);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [name, setName] = useState("");
  const [selectedUseCaseTags, setSelectedUseCaseTags] = useState<string[]>(["research notes"]);
  const [customUseCaseTags, setCustomUseCaseTags] = useState("");
  const [showCustomUseCaseInput, setShowCustomUseCaseInput] = useState(false);
  const [selectedStyleTags, setSelectedStyleTags] = useState<string[]>(["concise", "practical"]);
  const [customStyleTags, setCustomStyleTags] = useState("");
  const [showCustomStyleInput, setShowCustomStyleInput] = useState(false);
  const primaryUseCase = buildTagList(selectedUseCaseTags, customUseCaseTags);
  const assistantStyle = buildTagList(selectedStyleTags, customStyleTags);
  const isProviderFormOpen = isAddingProvider || editingProviderId !== null;
  const canContinue = useMemo(() => {
    if (step === 2) return !isProviderFormOpen;
    if (step === 3) return requiredModelsReady;
    if (step === 4) {
      return !!name.trim() && !!primaryUseCase.trim() && !!assistantStyle.trim();
    }
    if (step === 5) return !isSaving;
    return true;
  }, [
    assistantStyle,
    isProviderFormOpen,
    isSaving,
    name,
    primaryUseCase,
    requiredModelsReady,
    step,
  ]);

  const handleOpenAddProvider = (): void => {
    setIsAddingProvider(true);
    setEditingProviderId(null);
    setProviderForm(emptyProviderForm());
    setShowApiKey(false);
  };

  const handleOpenEditProvider = (provider: ProviderRow): void => {
    setEditingProviderId(provider.id);
    setIsAddingProvider(false);
    setProviderForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: getProviderApiKey(provider),
      apiFormat: provider.apiFormat,
    });
    setShowApiKey(false);
  };

  const handleCancelProviderForm = (): void => {
    setIsAddingProvider(false);
    setEditingProviderId(null);
    setShowApiKey(false);
  };

  const handleSaveProvider = (): void => {
    if (!providerForm.name.trim() || !providerForm.baseUrl.trim()) {
      add({
        title: "Missing fields",
        description: "Name and base URL are required.",
        type: "error",
      });
      return;
    }

    try {
      normalizeProviderEndpoint(providerForm.baseUrl);
    } catch (error) {
      add({
        title: "Check the base URL",
        description: error instanceof Error ? error.message : "Invalid endpoint.",
        type: "error",
      });
      return;
    }
    if (isAddingProvider) {
      onCreateProvider(providerForm);
      add({ title: "Provider added", type: "success" });
    } else if (editingProviderId) {
      onUpdateProvider(editingProviderId, providerForm);
      add({ title: "Provider updated", type: "success" });
    }

    handleCancelProviderForm();
  };

  const handleDeleteExistingProvider = (providerId: string): void => {
    onDeleteProvider(providerId);
    if (editingProviderId === providerId) {
      handleCancelProviderForm();
    }
    add({ title: "Provider removed", type: "success" });
  };

  const handleToggleStyleTag = (tag: string): void => {
    setSelectedStyleTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const handleToggleUseCaseTag = (tag: string): void => {
    setSelectedUseCaseTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const handleContinue = async (): Promise<void> => {
    if (!canContinue || isSaving) return;

    if (step < 5) {
      setStep((current) => current + 1);
      return;
    }

    try {
      await onComplete({
        name: name.trim().replace(/\s+/g, " "),
        primaryUseCase: primaryUseCase.trim(),
        assistantStyle,
      });
    } catch {
      return;
    }
    setStep(6);
    window.setTimeout(() => {
      void navigate("/", { replace: true });
    }, 650);
  };

  return (
    <div className="grid h-dvh w-full overflow-hidden bg-[#fbf7ed] text-[#25231f] lg:grid-cols-[minmax(22rem,45vw)_minmax(0,1fr)]">
      <BrandPanel />
      <main className="h-dvh min-w-0 overflow-y-auto px-6 sm:px-10 lg:px-20">
        <section className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            <p className="text-[11px] font-black tracking-[0.24em] text-[#8fa06f] [font-family:monospace]">
              MEMORA
            </p>
          </div>
          <div className="mb-10">
            <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-[#8d877d] uppercase">
              Step {step} / {TOTAL_STEPS}
            </p>
            <h1 className="text-[clamp(2.1rem,3vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.01em] text-[#24231f]">
              {getStepTitle(step)}
            </h1>
            <p className="mt-5 max-w-full text-[clamp(1rem,1.2vw,1.35rem)] leading-[1.35] text-[#777167]">
              {getStepDescription(step)}
            </p>
          </div>

          <motion.div
            key={step}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0.1 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="space-y-8"
          >
            {step === 3 ? (
              <div className="space-y-5">
                <FeatureModelSettings features={["assistant", "personality"]} disabled={isSaving} />
                <div className="space-y-5">
                  {localModelOptions.map((model) => (
                    <OnboardingLocalModelDownloadCard
                      key={model.id}
                      model={model}
                      onDownload={onDownloadLocalModel}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <ProviderManagementSection
                  title="Configured providers"
                  emptyMessage="No providers configured yet. Add one now or continue and set it up later in Settings."
                  providers={providers}
                  editingProviderId={editingProviderId}
                  isAddingProvider={isAddingProvider}
                  providerForm={providerForm}
                  showApiKey={showApiKey}
                  fetchingModels={fetchingProviderId}
                  onProviderFormChange={(patch) => {
                    setProviderForm((current) => ({ ...current, ...patch }));
                  }}
                  onAddProvider={handleOpenAddProvider}
                  onEditProvider={handleOpenEditProvider}
                  onCancelProviderForm={handleCancelProviderForm}
                  onSaveProvider={handleSaveProvider}
                  onDeleteProvider={handleDeleteExistingProvider}
                  onFetchProviderModels={async (provider) => {
                    setFetchingProviderId(provider.id);
                    try {
                      await onFetchProviderModels(provider);
                    } finally {
                      setFetchingProviderId(null);
                    }
                  }}
                  onToggleApiKey={() => setShowApiKey((current) => !current)}
                />
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-4">
                <label className="block space-y-2.5">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[#8d877d] uppercase">
                    Your name
                  </span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="What should Memora call you?"
                    className="w-full rounded-[1rem] border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-base outline-none transition focus:border-[#9ca97a]"
                  />
                </label>
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[#8d877d] uppercase">
                    What do you want to use Memora for?
                  </p>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 select-none">
                      {USE_CASE_TAGS.map((tag) => {
                        const selected = selectedUseCaseTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleUseCaseTag(tag)}
                            className={cn(
                              "select-none rounded-full border px-3 py-1.5 text-xs font-medium transition",
                              selected
                                ? "border-[#24231f] bg-[#24231f] text-[#fffdf8]"
                                : "border-[#ded7c9] bg-[#fffdf8] text-[#777167] hover:bg-[#f3eee3]",
                            )}
                          >
                            {tag}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowCustomUseCaseInput(true)}
                        className="inline-flex select-none items-center gap-1 rounded-full border border-[#ded7c9] bg-[#fffdf8] px-3 py-1.5 text-xs font-medium text-[#777167] transition hover:bg-[#f3eee3]"
                      >
                        <PlusIcon className="size-3" weight="bold" />
                        Custom
                      </button>
                    </div>
                    {showCustomUseCaseInput || customUseCaseTags ? (
                      <input
                        value={customUseCaseTags}
                        onChange={(event) => setCustomUseCaseTags(event.target.value)}
                        placeholder="Add custom tags, separated by commas"
                        className="w-full rounded-[1rem] border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-base outline-none transition focus:border-[#9ca97a]"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[#8d877d] uppercase">
                    Reply tone
                  </p>
                  <div className="flex flex-wrap gap-2 select-none">
                    {STYLE_TAGS.map((tag) => {
                      const selected = selectedStyleTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleStyleTag(tag)}
                          className={cn(
                            "select-none rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            selected
                              ? "border-[#24231f] bg-[#24231f] text-[#fffdf8]"
                              : "border-[#ded7c9] bg-[#fffdf8] text-[#777167] hover:bg-[#f3eee3]",
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowCustomStyleInput(true)}
                      className="inline-flex select-none items-center gap-1 rounded-full border border-[#ded7c9] bg-[#fffdf8] px-3 py-1.5 text-xs font-medium text-[#777167] transition hover:bg-[#f3eee3]"
                    >
                      <PlusIcon className="size-3" weight="bold" />
                      Custom
                    </button>
                  </div>
                  {showCustomStyleInput || customStyleTags ? (
                    <input
                      value={customStyleTags}
                      onChange={(event) => setCustomStyleTags(event.target.value)}
                      placeholder="Add custom tags, separated by commas"
                      className="w-full rounded-[1rem] border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-base outline-none transition focus:border-[#9ca97a]"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-4">
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
                      transition={{
                        duration: prefersReducedMotion ? 0.12 : 0.28,
                      }}
                      className="space-y-2 px-0.5"
                    >
                      <p className="text-xs font-semibold tracking-[0.08em] text-[#8d877d] uppercase">
                        Soul Document stream
                      </p>
                      <div className="max-h-72 overflow-y-auto rounded-[1.4rem] border border-[#ded7c9] bg-[#fffdf8] p-5 text-sm text-[#25231f]">
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
                      transition={{
                        duration: prefersReducedMotion ? 0.12 : 0.24,
                      }}
                      className="space-y-3 rounded-[1.4rem] border border-[#ded7c9] bg-[#fffdf8] p-6 text-sm text-[#777167]"
                    >
                      <p>
                        <span className="font-semibold text-[#24231f]">Name:</span> {name.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#24231f]">Use case:</span>{" "}
                        {primaryUseCase.trim()}
                      </p>
                      <p>
                        <span className="font-semibold text-[#24231f]">Reply tone:</span>{" "}
                        {assistantStyle}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : null}

            {errorMessage ? (
              <p className="rounded-[0.9rem] border border-[var(--color-memora-warning-border)] bg-[var(--color-memora-warning-surface)] px-3 py-2 text-xs text-[var(--color-memora-warning-text)]">
                {errorMessage}
              </p>
            ) : null}

            {step < 6 ? (
              <div className="flex items-center justify-between pt-2">
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
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[1rem] border border-[#ded7c9] bg-[#fffdf8] px-5 text-sm font-semibold text-[#5f5a52] transition hover:bg-[#f3eee3] disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[1rem] bg-[#24231f] px-6 text-sm font-semibold text-[#fffdf8] transition hover:bg-[#35332e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {step === 5 ? (isSaving ? "Constructing..." : "Next") : "Continue"}
                  <ArrowRightIcon className="size-3.5" weight="bold" />
                </motion.button>
              </div>
            ) : null}
          </motion.div>
        </section>
      </main>
    </div>
  );
}
