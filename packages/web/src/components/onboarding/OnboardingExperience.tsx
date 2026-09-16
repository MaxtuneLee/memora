import { Toast } from "@base-ui/react/toast";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@phosphor-icons/react";
import {
  nemotron35AsrStreamingManifest,
  whisperBaseTimestampedManifest,
} from "@memora/local-model-runtime";
import { motion, useReducedMotion } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router";

import ProviderManagementSection from "@/components/settings/ProviderManagementSection";
import FeatureModelSettings from "@/components/settings/FeatureModelSettings";
import LocalModelDownloadCard from "@/components/settings/LocalModelDownloadCard";
import { AudioVisualizer } from "@/components/transcript/AudioVisualizer";
import { TranscriptionPanel } from "@/components/transcript/TranscriptionPanel";
import { RecordingPreviewSurface } from "@/components/transcript/transcriptDetail/RecordingPreviewSurface";
import { TranscriptSidebar } from "@/components/library/TranscriptSidebar";
import {
  useLocalModelDownloadActions,
  useLocalModelDownloadState,
} from "@/hooks/settings/useLocalModelDownloadSettings";
import { useRecordingDetail } from "@/hooks/transcript/useRecordingDetail";
import type { TranscriptSession } from "@/hooks/transcript/useTranscript";
import { getLocalModelOptions } from "@/lib/local-model";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";
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
  providers: ProviderRow[];
  getProviderApiKey: (provider: ProviderRow) => string;
  requiredModelsReady: boolean;
  transcript: TranscriptSession;
  transcriptionModelId: string;
  onSelectTranscriptionMode: (modelId: string) => void;
  onCreateProvider: (providerForm: ProviderFormState) => void;
  onUpdateProvider: (providerId: string, providerForm: ProviderFormState) => void;
  onDeleteProvider: (providerId: string) => void;
  onFetchProviderModels: (provider: ProviderRow) => void | Promise<void>;
  onComplete: (input: OnboardingProfileInput) => Promise<void>;
}

const TOTAL_STEPS = 8;
const PATTERN_MARKS = Array.from({ length: 104 }, (_, index) => index);

const styles = stylex.create({
  tailSvg: { height: "100%", overflow: "visible", width: "100%" },
  tailInteractive: { cursor: "pointer" },
  brandPanel: {
    backgroundColor: "#8fa06f",
    display: { default: "none", "@media (min-width: 1024px)": "block" },
    height: "100dvh",
    overflow: "hidden",
    position: "relative",
  },
  patternLayer: { inset: 0, opacity: 0.35, position: "absolute" },
  patternGrid: {
    display: "grid",
    gap: "2.25rem 2.5rem",
    gridTemplateColumns: "repeat(8,minmax(0,1fr))",
    padding: "2.5rem",
  },
  patternMark: {
    display: "block",
    height: "1.25rem",
    position: "relative",
    width: "1.25rem",
    "::before": {
      backgroundColor: "#6f8050",
      borderRadius: "9999px",
      content: "''",
      height: "100%",
      left: "50%",
      position: "absolute",
      top: 0,
      transform: "translateX(-50%) rotate(45deg)",
      width: "5px",
    },
    "::after": {
      backgroundColor: "#6f8050",
      borderRadius: "9999px",
      content: "''",
      height: "100%",
      left: "50%",
      position: "absolute",
      top: 0,
      transform: "translateX(-50%) rotate(-45deg)",
      width: "5px",
    },
  },
  tail: {
    height: "26rem",
    left: "50%",
    maxWidth: "none",
    position: "absolute",
    top: "-9rem",
    transform: "translateX(-58%) rotate(16deg)",
    width: "14.08rem",
  },
  logo: {
    left: "50%",
    maxWidth: "none",
    position: "absolute",
    top: "44%",
    transform: "translateX(-50%)",
    userSelect: "none",
    width: "min(13.5rem,28vw)",
  },
  cat: {
    bottom: "-10rem",
    left: "50%",
    maxWidth: "none",
    position: "absolute",
    transform: "translateX(-48%)",
    width: "min(30rem,54vw)",
  },
  root: {
    backgroundColor: "#fbf7ed",
    color: "#25231f",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1024px)": "minmax(22rem,45vw) minmax(0,1fr)",
    },
    height: "100dvh",
    overflow: "hidden",
    width: "100%",
  },
  main: {
    height: "100dvh",
    minWidth: 0,
    overflowY: "auto",
    paddingInline: {
      default: "1.5rem",
      "@media (min-width: 640px)": "2.5rem",
      "@media (min-width: 1024px)": "5rem",
    },
  },
  content: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    marginInline: "auto",
    maxWidth: "46rem",
    minHeight: "100%",
    paddingBlock: "2.5rem",
    width: "100%",
  },
  mobileBrand: {
    marginBottom: "2rem",
    display: { default: "block", "@media (min-width: 1024px)": "none" },
  },
  mobileBrandText: {
    color: "#8fa06f",
    fontFamily: "monospace",
    fontSize: "0.6875rem",
    fontWeight: 900,
    letterSpacing: "0.24em",
  },
  intro: { marginBottom: "2.5rem" },
  step: {
    color: "#8d877d",
    fontSize: "0.75rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    marginBottom: "1rem",
    textTransform: "uppercase",
  },
  heading: {
    color: "#24231f",
    fontSize: "clamp(2.1rem,3vw,3.2rem)",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.05,
  },
  description: {
    color: "#777167",
    fontSize: "clamp(1rem,1.2vw,1.35rem)",
    lineHeight: 1.35,
    marginTop: "1.25rem",
    maxWidth: "100%",
  },
  stack8: { display: "flex", flexDirection: "column", gap: "2rem" },
  stack5: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  stack4: { display: "flex", flexDirection: "column", gap: "1rem" },
  stack2: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  label: { display: "flex", flexDirection: "column", gap: "0.625rem" },
  fieldLabel: {
    color: "#8d877d",
    fontSize: "0.75rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#fffdf8",
    borderColor: { default: "#ded7c9", ":focus": "#9ca97a" },
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    fontSize: "1rem",
    outline: "none",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    transition: "border-color 150ms",
    width: "100%",
  },
  tagList: { display: "flex", flexWrap: "wrap", gap: "0.5rem", userSelect: "none" },
  tag: {
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    fontSize: "0.75rem",
    fontWeight: 500,
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms",
    userSelect: "none",
  },
  tagSelected: { backgroundColor: "#24231f", borderColor: "#24231f", color: "#fffdf8" },
  tagIdle: {
    backgroundColor: { default: "#fffdf8", ":hover": "#f3eee3" },
    borderColor: "#ded7c9",
    color: "#777167",
  },
  customTag: { alignItems: "center", display: "inline-flex", gap: "0.25rem" },
  icon12: { height: "0.75rem", width: "0.75rem" },
  modeGrid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
    },
  },
  mode: {
    borderRadius: "1.2rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1rem",
    textAlign: "left",
    transition: "background-color 150ms",
  },
  modeSelected: { backgroundColor: "#24231f", borderColor: "#24231f", color: "#fffdf8" },
  modeIdle: {
    backgroundColor: { default: "#fffdf8", ":hover": "#f3eee3" },
    borderColor: "#ded7c9",
    color: "#25231f",
  },
  modeTitle: { fontSize: "0.875rem", fontWeight: 600 },
  modeDescription: { fontSize: "0.75rem", lineHeight: "1.25rem", marginTop: "0.25rem" },
  modeDescriptionSelected: { color: "#e8e4da" },
  modeDescriptionIdle: { color: "#777167" },
  warningCard: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderColor: "var(--color-memora-warning-border)",
    borderRadius: "1.2rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "1rem",
  },
  warningText: { color: "var(--color-memora-warning-text)", fontSize: "0.875rem" },
  warningAction: {
    color: "var(--color-memora-warning-text)",
    fontSize: "0.75rem",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  skip: {
    color: { default: "#8d877d", ":hover": "#5f5a52" },
    fontSize: "0.75rem",
    fontWeight: 500,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  recordingCard: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7c9",
    borderRadius: "1.2rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    padding: "1rem",
  },
  visualizer: { height: "2.5rem", width: "100%" },
  transcription: {
    backgroundColor: "#fbf7ed",
    borderRadius: "1rem",
    height: "10rem",
    overflow: "hidden",
    padding: "0.75rem",
  },
  actionRow: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.75rem" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: { default: "#24231f", ":hover": "#35332e" },
    borderRadius: "1rem",
    color: "#fffdf8",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    justifyContent: "center",
    minHeight: "3rem",
    paddingInline: "1.5rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: { default: "#fffdf8", ":hover": "#f3eee3" },
    borderColor: "#ded7c9",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "#5f5a52",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    justifyContent: "center",
    minHeight: "3rem",
    paddingInline: "1.25rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  smallWarning: { color: "var(--color-memora-warning-text)", fontSize: "0.75rem" },
  preview: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7c9",
    borderRadius: "1.2rem",
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  transcriptPreview: { height: "16rem" },
  loading: { color: "#777167", fontSize: "0.875rem" },
  error: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderColor: "var(--color-memora-warning-border)",
    borderRadius: "0.9rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-warning-text)",
    fontSize: "0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  navigation: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingTop: "0.5rem",
  },
  icon14: { height: "0.875rem", width: "0.875rem" },
});

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

const TRANSCRIPTION_MODES = [
  {
    modelId: nemotron35AsrStreamingManifest.id,
    label: "Fast",
    description: "Nemotron 3.5 ASR Streaming",
  },
  {
    modelId: whisperBaseTimestampedManifest.id,
    label: "Accurate",
    description: "Whisper Base",
  },
] as const;

const TRANSCRIPTION_MODEL_OPTIONS = getLocalModelOptions().filter((option) =>
  TRANSCRIPTION_MODES.some((mode) => mode.modelId === option.id),
);

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
  if (step === 5) return "Choose transcription model";
  if (step === 6) return "Try real-time transcription";
  if (step === 7) return "Review your recording";
  return "Setup Complete";
};

const getStepDescription = (step: number): string => {
  if (step === 1) {
    return "Memora is your personal knowledge base that lives in your browser. ";
  }
  if (step === 2) {
    return "Chat uses cloud models. Add a provider now, or set up chat later. API keys will only stay on this device.";
  }
  if (step === 3) {
    return "Choose the model for chat. Other features can be configured individually in Settings.";
  }
  if (step === 4) {
    return "These details shape how Memora addresses and responds to you. You can change them anytime in Settings.";
  }
  if (step === 5) {
    return "Fast models respond quicker; accurate models take longer but capture more detail. Download the one you want to try.";
  }
  if (step === 6) {
    return "Say something and watch Memora transcribe it live.";
  }
  if (step === 7) {
    return "Play back your recording and follow along with the transcript.";
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
      className={stylex.props(styles.tailSvg).className}
      viewBox="0 0 486 898"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        ref={tailPathRef}
        d={buildTailPath(0)}
        className={stylex.props(!prefersReducedMotion && styles.tailInteractive).className}
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
    <aside {...stylex.props(styles.brandPanel)}>
      <div {...stylex.props(styles.patternLayer)}>
        <div {...stylex.props(styles.patternGrid)}>
          {PATTERN_MARKS.map((mark) => (
            <span key={mark} {...stylex.props(styles.patternMark)} />
          ))}
        </div>
      </div>

      <div aria-hidden="true" {...stylex.props(styles.tail)}>
        <AnimatedTail prefersReducedMotion={!!prefersReducedMotion} />
      </div>
      <img src="/onboarding-assets/logo-text.svg" alt="Memora" {...stylex.props(styles.logo)} />
      <img
        src="/onboarding-assets/cat-right.svg"
        alt=""
        aria-hidden="true"
        {...stylex.props(styles.cat)}
      />
    </aside>
  );
}

export default function OnboardingExperience({
  isSaving,
  errorMessage,
  providers,
  getProviderApiKey,
  requiredModelsReady,
  transcript,
  transcriptionModelId,
  onSelectTranscriptionMode,
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
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [mediaReadyToken, setMediaReadyToken] = useState(0);
  const currentTimeRef = useRef(0);
  const seekRef = useRef<number | null>(null);
  const { recording: trialRecording } = useRecordingDetail(transcript.lastSavedId ?? undefined);
  const { handleDownloadLocalModel } = useLocalModelDownloadActions({
    open: true,
    modelOptions: TRANSCRIPTION_MODEL_OPTIONS,
  });
  const transcriptionDownloadState = useLocalModelDownloadState(transcriptionModelId);
  const selectedTranscriptionModelOption = TRANSCRIPTION_MODEL_OPTIONS.find(
    (option) => option.id === transcriptionModelId,
  );
  const primaryUseCase = buildTagList(selectedUseCaseTags, customUseCaseTags);
  const assistantStyle = buildTagList(selectedStyleTags, customStyleTags);
  const isProviderFormOpen = isAddingProvider || editingProviderId !== null;
  const canContinue = useMemo(() => {
    if (step === 2) return !isProviderFormOpen;
    if (step === 3) return requiredModelsReady;
    if (step === 4) {
      return !!name.trim() && !!primaryUseCase.trim() && !!assistantStyle.trim();
    }
    if (step === 5) return transcript.status === "ready";
    if (step === 6) return transcript.saveStatus === "success";
    return true;
  }, [
    assistantStyle,
    isProviderFormOpen,
    name,
    primaryUseCase,
    requiredModelsReady,
    step,
    transcript.saveStatus,
    transcript.status,
  ]);

  useEffect(() => {
    if (step !== 5) return;
    // Re-check whenever the mode changes AND whenever the download card's own
    // state moves (e.g. to "cached") — otherwise a completed download never
    // gets noticed here, since nothing else in this effect's deps changes
    // while the user sits on step 5 downloading.
    void transcript.checkModelCache();
  }, [step, transcriptionModelId, transcriptionDownloadState?.status, transcript.checkModelCache]);

  useEffect(() => {
    if (step !== 5) return;
    if (transcript.status !== null) return;
    if (transcript.isCheckingCache) return;
    if (!transcript.isModelCached) return;
    transcript.loadModel();
  }, [
    step,
    transcript.status,
    transcript.isCheckingCache,
    transcript.isModelCached,
    transcript.loadModel,
  ]);

  useEffect(() => {
    if (step !== 6) return;
    if (transcript.saveStatus !== "success" || !transcript.lastSavedId) return;
    setStep(7);
  }, [step, transcript.saveStatus, transcript.lastSavedId]);

  useEffect(() => {
    if (step !== TOTAL_STEPS) return;
    const timeoutId = window.setTimeout(() => {
      void navigate("/", { replace: true });
    }, 650);
    return () => window.clearTimeout(timeoutId);
  }, [step, navigate]);

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

  const handleStartTrial = async (): Promise<void> => {
    setRecordingError(null);
    try {
      await transcript.handleStartRecording();
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "Could not access your microphone.",
      );
    }
  };

  const handleContinue = async (): Promise<void> => {
    if (!canContinue || isSaving) return;

    if (step === 2 && providers.length === 0) {
      setStep(4);
      return;
    }

    if (step === 4) {
      try {
        await onComplete({
          name: name.trim().replace(/\s+/g, " "),
          primaryUseCase: primaryUseCase.trim(),
          assistantStyle,
        });
      } catch {
        return;
      }
      setStep(transcript.isWebGpuAvailable ? 5 : TOTAL_STEPS);
      return;
    }

    if (step < TOTAL_STEPS) {
      setStep((current) => current + 1);
    }
  };

  return (
    <div {...stylex.props(styles.root)}>
      <BrandPanel />
      <main {...stylex.props(styles.main)}>
        <section {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.mobileBrand)}>
            <p {...stylex.props(styles.mobileBrandText)}>MEMORA</p>
          </div>
          <div {...stylex.props(styles.intro)}>
            <p {...stylex.props(styles.step)}>
              Step {step} / {TOTAL_STEPS}
            </p>
            <h1 {...stylex.props(styles.heading)}>{getStepTitle(step)}</h1>
            <p {...stylex.props(styles.description)}>{getStepDescription(step)}</p>
          </div>

          <motion.div
            key={step}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0.1 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={stylex.props(styles.stack8).className}
          >
            {step === 3 ? (
              <div {...stylex.props(styles.stack5)}>
                <FeatureModelSettings
                  features={["assistant"]}
                  disabled={isSaving}
                  autoSelectFirstProvider
                />
              </div>
            ) : null}

            {step === 2 ? (
              <div {...stylex.props(styles.stack4)}>
                <ProviderManagementSection
                  title="Configured providers"
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
              <div {...stylex.props(styles.stack4)}>
                <label {...stylex.props(styles.label)}>
                  <span {...stylex.props(styles.fieldLabel)}>Your name</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="What should Memora call you?"
                    className={stylex.props(styles.input).className}
                  />
                </label>
                <div {...stylex.props(styles.label)}>
                  <p {...stylex.props(styles.fieldLabel)}>What do you want to use Memora for?</p>
                  <div {...stylex.props(styles.stack2)}>
                    <div {...stylex.props(styles.tagList)}>
                      {USE_CASE_TAGS.map((tag) => {
                        const selected = selectedUseCaseTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleUseCaseTag(tag)}
                            {...stylex.props(
                              styles.tag,
                              selected ? styles.tagSelected : styles.tagIdle,
                            )}
                          >
                            {tag}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setShowCustomUseCaseInput(true)}
                        {...stylex.props(styles.tag, styles.tagIdle, styles.customTag)}
                      >
                        <PlusIcon className={stylex.props(styles.icon12).className} weight="bold" />
                        Custom
                      </button>
                    </div>
                    {showCustomUseCaseInput || customUseCaseTags ? (
                      <input
                        value={customUseCaseTags}
                        onChange={(event) => setCustomUseCaseTags(event.target.value)}
                        placeholder="Add custom tags, separated by commas"
                        className={stylex.props(styles.input).className}
                      />
                    ) : null}
                  </div>
                </div>
                <div {...stylex.props(styles.stack2)}>
                  <p {...stylex.props(styles.fieldLabel)}>Reply tone</p>
                  <div {...stylex.props(styles.tagList)}>
                    {STYLE_TAGS.map((tag) => {
                      const selected = selectedStyleTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleStyleTag(tag)}
                          {...stylex.props(
                            styles.tag,
                            selected ? styles.tagSelected : styles.tagIdle,
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowCustomStyleInput(true)}
                      {...stylex.props(styles.tag, styles.tagIdle, styles.customTag)}
                    >
                      <PlusIcon className={stylex.props(styles.icon12).className} weight="bold" />
                      Custom
                    </button>
                  </div>
                  {showCustomStyleInput || customStyleTags ? (
                    <input
                      value={customStyleTags}
                      onChange={(event) => setCustomStyleTags(event.target.value)}
                      placeholder="Add custom tags, separated by commas"
                      className={stylex.props(styles.input).className}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div {...stylex.props(styles.stack5)}>
                <div {...stylex.props(styles.modeGrid)}>
                  {TRANSCRIPTION_MODES.map((mode) => {
                    const selected = transcriptionModelId === mode.modelId;
                    return (
                      <button
                        key={mode.modelId}
                        type="button"
                        onClick={() => onSelectTranscriptionMode(mode.modelId)}
                        {...stylex.props(
                          styles.mode,
                          selected ? styles.modeSelected : styles.modeIdle,
                        )}
                      >
                        <p {...stylex.props(styles.modeTitle)}>{mode.label}</p>
                        <p
                          {...stylex.props(
                            styles.modeDescription,
                            selected ? styles.modeDescriptionSelected : styles.modeDescriptionIdle,
                          )}
                        >
                          {mode.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedTranscriptionModelOption ? (
                  <LocalModelDownloadCard
                    model={selectedTranscriptionModelOption}
                    state={transcriptionDownloadState}
                    onDownload={handleDownloadLocalModel}
                  />
                ) : null}

                {transcript.status === "error" && transcriptionDownloadState?.status !== "error" ? (
                  <div {...stylex.props(styles.warningCard)}>
                    <p {...stylex.props(styles.warningText)}>
                      {transcript.loadingMessage || "Could not prepare this model for recording."}
                    </p>
                    <button
                      type="button"
                      onClick={transcript.loadModel}
                      className={stylex.props(styles.warningAction).className}
                    >
                      Retry
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setStep(TOTAL_STEPS)}
                  className={stylex.props(styles.skip).className}
                >
                  Skip for now
                </button>
              </div>
            ) : null}

            {step === 6 ? (
              <div {...stylex.props(styles.stack5)}>
                <div {...stylex.props(styles.recordingCard)}>
                  <AudioVisualizer
                    stream={transcript.stream}
                    className={stylex.props(styles.visualizer).className}
                  />
                  <div {...stylex.props(styles.transcription)}>
                    <TranscriptionPanel
                      accumulatedText={transcript.accumulatedText}
                      currentSegmentPrefix={transcript.currentSegmentPrefix}
                      currentSegment={transcript.currentSegment}
                      tps={transcript.tps}
                    />
                  </div>
                  <div {...stylex.props(styles.actionRow)}>
                    {!transcript.recording ? (
                      <button
                        type="button"
                        onClick={() => void handleStartTrial()}
                        disabled={transcript.status !== "ready"}
                        className={stylex.props(styles.primaryButton).className}
                      >
                        Start recording
                      </button>
                    ) : transcript.paused ? (
                      <button
                        type="button"
                        onClick={transcript.handleResumeRecording}
                        className={stylex.props(styles.secondaryButton).className}
                      >
                        Resume
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={transcript.handlePauseRecording}
                          className={stylex.props(styles.secondaryButton).className}
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={transcript.handleFinalizeRecording}
                          className={stylex.props(styles.primaryButton).className}
                        >
                          Finish
                        </button>
                      </>
                    )}
                  </div>
                  {recordingError ? (
                    <p {...stylex.props(styles.smallWarning)}>{recordingError}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(TOTAL_STEPS)}
                  className={stylex.props(styles.skip).className}
                >
                  Skip for now
                </button>
              </div>
            ) : null}

            {step === 7 ? (
              <div {...stylex.props(styles.stack5)}>
                {trialRecording ? (
                  <>
                    <div {...stylex.props(styles.preview)}>
                      <RecordingPreviewSurface
                        recording={trialRecording}
                        mediaReadyToken={mediaReadyToken}
                        transcriptWords={trialRecording.transcript?.words ?? []}
                        currentTimeRef={currentTimeRef}
                        seekRef={seekRef}
                        onMediaReady={() => setMediaReadyToken((current) => current + 1)}
                      />
                    </div>
                    <div {...stylex.props(styles.preview, styles.transcriptPreview)}>
                      <TranscriptSidebar
                        words={trialRecording.transcript?.words ?? []}
                        text={trialRecording.transcript?.text}
                        timeRef={currentTimeRef}
                        onSeek={(time) => {
                          seekRef.current = time;
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p {...stylex.props(styles.loading)}>Loading your recording...</p>
                )}
              </div>
            ) : null}

            {errorMessage ? <p {...stylex.props(styles.error)}>{errorMessage}</p> : null}

            {step < TOTAL_STEPS ? (
              <div {...stylex.props(styles.navigation)}>
                <motion.button
                  type="button"
                  disabled={step === 1 || isSaving}
                  onClick={() =>
                    setStep((current) => {
                      if (current === 4 && providers.length === 0) return 2;
                      return Math.max(1, current - 1);
                    })
                  }
                  whileHover={
                    prefersReducedMotion || step === 1 || isSaving
                      ? undefined
                      : { y: -1, scale: 1.01 }
                  }
                  whileTap={
                    prefersReducedMotion || step === 1 || isSaving ? undefined : { scale: 0.98 }
                  }
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className={stylex.props(styles.secondaryButton).className}
                >
                  <ArrowLeftIcon className={stylex.props(styles.icon14).className} weight="bold" />
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
                  className={stylex.props(styles.primaryButton).className}
                >
                  {isSaving ? "Saving..." : "Continue"}
                  <ArrowRightIcon className={stylex.props(styles.icon14).className} weight="bold" />
                </motion.button>
              </div>
            ) : null}
          </motion.div>
        </section>
      </main>
    </div>
  );
}
