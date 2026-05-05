import type {
  LocalChatEvent,
  LocalChatRequest,
  LocalModelManifest,
} from "@memora/local-model-runtime";

export interface LocalChatAdapter {
  run: (
    input: {
      manifest: LocalModelManifest;
      request: LocalChatRequest;
      canceled: () => boolean;
    },
    emit: (event: LocalChatEvent) => void,
  ) => Promise<void>;
}
