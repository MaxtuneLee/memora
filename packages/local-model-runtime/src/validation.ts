import { createLocalModelError } from "./errors";
import { builtInLocalModelManifests } from "./manifests";
import type {
  LocalChatRequest,
  LocalModelError,
  LocalModelManifest,
  LocalModelModality,
  LocalReasoningMode,
} from "./types";

export type LocalModelValidationResult =
  | { ok: true; manifest: LocalModelManifest }
  | { ok: false; error: LocalModelError };

export const getLocalModelManifest = (id: string): LocalModelManifest | undefined => {
  return builtInLocalModelManifests.find((manifest) => manifest.id === id);
};

const contentToModality = (type: string): LocalModelModality | undefined => {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  return undefined;
};

const isLocalReasoningMode = (value: unknown): value is LocalReasoningMode => {
  return value === "non-thinking" || value === "thinking";
};

export const validateLocalChatRequest = (request: LocalChatRequest): LocalModelValidationResult => {
  const manifest = getLocalModelManifest(request.modelId);
  if (!manifest || manifest.task !== "chat" || !manifest.chat) {
    return {
      ok: false,
      error: createLocalModelError(
        "model-not-found",
        `Local chat model not found: ${request.modelId}`,
      ),
    };
  }

  for (const message of request.messages) {
    for (const content of message.content) {
      const modality = contentToModality(content.type);
      if (modality && !manifest.modalities.input.includes(modality)) {
        return {
          ok: false,
          error: createLocalModelError(
            "unsupported-modality",
            `${manifest.displayName} does not support ${modality} input.`,
          ),
        };
      }
    }
  }

  if (request.tools.length > 0 && !manifest.chat.supportsTools) {
    return {
      ok: false,
      error: createLocalModelError(
        "unsupported-tools",
        `${manifest.displayName} does not support tool calling.`,
      ),
    };
  }

  if (request.reasoningMode !== undefined) {
    if (
      !isLocalReasoningMode(request.reasoningMode) ||
      !manifest.chat.reasoningModes.includes(request.reasoningMode)
    ) {
      return {
        ok: false,
        error: createLocalModelError(
          "unsupported-reasoning",
          `${manifest.displayName} does not support reasoning mode ${request.reasoningMode}.`,
        ),
      };
    }
  }

  return { ok: true, manifest };
};
