import { lazy, Suspense, type ComponentProps, type ReactElement } from "react";

// ChatMessage renders markdown through Streamdown, which brings code highlighting and diagrams
// with it. Loading it on demand keeps the first paint of the page light.
const ChatMessageImpl = lazy(() =>
  import("@web/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })),
);

export function ChatMessage(props: ComponentProps<typeof ChatMessageImpl>): ReactElement {
  return (
    <Suspense fallback={<div style={{ minHeight: 64 }} />}>
      <ChatMessageImpl {...props} />
    </Suspense>
  );
}
