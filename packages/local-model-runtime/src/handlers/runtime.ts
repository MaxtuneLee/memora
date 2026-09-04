import { getLocalModelManifest, validateLocalChatRequest } from "../validation";
import type { LocalModelEvent, LocalModelTask } from "../types";

import { runWhisperTranscription } from "./asr/whisper";
import { preloadGemma4Chat, runGemma4Chat } from "./chat/gemma4";
import { preloadQwen35Chat, runQwen35Chat } from "./chat/qwen35";
import { runEmbeddingTask } from "./embedding";
import { runFormulaTask } from "./formula";

export const runLocalModelTask = async (
  task: LocalModelTask,
  emit: (event: LocalModelEvent) => void,
  canceled: () => boolean = () => false,
): Promise<void> => {
  switch (task.kind) {
    case "embedding.generate":
      await runEmbeddingTask(task, { emit, isCanceled: canceled });
      return;
    case "formula.preload":
    case "formula.recognize":
      await runFormulaTask(task, { emit, isCanceled: canceled });
      return;
    case "model.preload": {
      const manifest = getLocalModelManifest(task.input.modelId);
      if (!manifest) {
        emit({
          type: "error",
          error: {
            code: "model-not-found",
            message: `Local model ${task.input.modelId} was not found.`,
          },
        });
        return;
      }

      if (manifest.task === "chat" && manifest.chat?.adapter === "qwen3.5") {
        await preloadQwen35Chat(manifest, emit);
        return;
      }

      if (manifest.task === "chat" && manifest.chat?.adapter === "gemma4") {
        await preloadGemma4Chat(manifest, emit);
        return;
      }

      if (manifest.task === "asr") {
        await runWhisperTranscription(
          {
            modelId: manifest.id,
            audio: new Float32Array(16_000),
            language: "en",
            returnTimestamps: "word",
          },
          emit,
        );
        return;
      }

      emit({
        type: "error",
        error: {
          code: "model-not-found",
          message: `No preload adapter found for ${manifest.displayName}.`,
        },
      });
      return;
    }
    case "asr.transcribe":
      await runWhisperTranscription(task.input, emit);
      return;
    case "chat.generate": {
      const validation = validateLocalChatRequest(task.input);
      if (!validation.ok) {
        emit({ type: "error", error: validation.error });
        return;
      }
      try {
        if (validation.manifest.chat?.adapter === "qwen3.5") {
          await runQwen35Chat(
            { manifest: validation.manifest, request: task.input, canceled },
            emit,
          );
          return;
        }
        if (validation.manifest.chat?.adapter === "gemma4") {
          await runGemma4Chat(
            { manifest: validation.manifest, request: task.input, canceled },
            emit,
          );
          return;
        }
        emit({
          type: "error",
          error: {
            code: "model-not-found",
            message: `No local chat adapter found for ${validation.manifest.displayName}.`,
          },
        });
      } catch (error) {
        emit({
          type: "error",
          error: {
            code: "generation-failed",
            message: error instanceof Error ? error.message : "Local chat generation failed.",
          },
        });
      }
      return;
    }
  }
};
