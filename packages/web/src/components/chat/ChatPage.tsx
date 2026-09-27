import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { ChatPageView } from "@/components/chat/chatPage/ChatPageView";
import { useChatController } from "@/components/chat/chatPage/useChatController";

export const Component = () => {
  const { viewProps, apiKeyPromptOpen, closeApiKeyPrompt, confirmApiKeyPrompt } =
    useChatController();

  return (
    <>
      <ConfirmDialog
        isOpen={apiKeyPromptOpen}
        title="Add an API key to start chatting"
        description="Chat runs on a cloud model. Add a provider and its API key in Settings. Your key stays on this device."
        confirmLabel="Add API key"
        cancelLabel="Not now"
        onConfirm={confirmApiKeyPrompt}
        onCancel={closeApiKeyPrompt}
      />
      <ChatPageView {...viewProps} />
    </>
  );
};
