import { Toast } from "@base-ui/react/toast";
import { act } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { ChatWidget } from "@/components/chat/ChatWidget";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";

vi.mock("@/livestore/store", () => ({
  useAppStore: () => {
    throw new Error("widget host exploded");
  },
}));

const WIDGET: ChatWidgetData = {
  toolCallId: "call-1",
  title: "Broken widget",
  loadingMessages: [],
  widgetCode: "<div>hi</div>",
  phase: "ready",
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  root?.unmount();
  host?.remove();
});

it("contains a widget crash and shows its error message", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  await act(async () => {
    root?.render(
      <Toast.Provider>
        <p>Chat stays here</p>
        <ChatWidget widget={WIDGET} />
      </Toast.Provider>,
    );
  });
  consoleError.mockRestore();

  expect(host.textContent).toContain("Chat stays here");
  const alert = host.querySelector("[role='alert']");
  expect(alert?.textContent).toContain("Broken widget");
  expect(alert?.textContent).toContain("widget host exploded");
});
