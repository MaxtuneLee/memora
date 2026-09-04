import type { LocalChatEvent, LocalChatRequest, LocalModelManifest } from "../../types";

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
