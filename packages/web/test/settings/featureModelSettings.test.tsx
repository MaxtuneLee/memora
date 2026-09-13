// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import FeatureModelSettings from "@/components/settings/FeatureModelSettings";
import { normalizeAiModelRouting } from "@/lib/models/modelRouting";
import { parseProviderModel } from "@/lib/settings/dialogHelpers";

const state = vi.hoisted(() => ({
  setFeatureModel: vi.fn(),
  catalog: vi.fn(),
  reload: vi.fn(),
  cache: vi.fn(),
  add: vi.fn(),
  localSessionTitle: false,
  assistantProviderId: "p",
}));
vi.mock("@base-ui/react/toast", () => ({ Toast: { useToastManager: () => ({ add: state.add }) } }));
vi.mock("@/hooks/settings/useProviderModelCatalog", () => ({
  useProviderModelCatalog: state.catalog,
}));
vi.mock("@/hooks/settings/useFeatureModels", () => ({
  useFeatureModels: () => ({
    routing: normalizeAiModelRouting({
      assistant: {
        source: "cloud",
        providerId: state.assistantProviderId,
        modelId: state.assistantProviderId ? "chat-model" : "",
      },
      ...(state.localSessionTitle
        ? { sessionTitle: { source: "local", modelId: "gemma-4-e2b-it-onnx" } }
        : {}),
    }),
    providers: [
      {
        id: "p",
        name: "Cloud provider",
        baseUrl: "https://example.test/v1",
        models: "[]",
        deletedAt: null,
      },
    ],
    credentials: [],
    setFeatureModel: state.setFeatureModel,
  }),
}));
vi.mock("@/lib/local-model", () => ({
  getLocalModelCacheStatus: state.cache,
  getLocalModelOptions: () => [
    { id: "gemma-4-e2b-it-onnx", name: "Gemma" },
    { id: "qwen3.5-0.8b-onnx-opt", name: "Qwen" },
  ],
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.localSessionTitle = false;
  state.assistantProviderId = "p";
  state.cache.mockResolvedValue({ cached: false });
  state.catalog.mockReturnValue({
    models: [parseProviderModel({ id: "other-model", name: "Other model" })],
    loading: false,
    error: null,
    reload: state.reload,
  });
});
afterEach(cleanup);

test("chat exposes cloud configuration and selects a fetched model", async () => {
  const user = userEvent.setup();
  render(<FeatureModelSettings features={["assistant"]} />);
  const chat = within(screen.getByRole("group", { name: "Chat" }));
  expect(chat.queryByLabelText("Execution")).toBeNull();
  expect(chat.queryByText("On this device")).toBeNull();
  expect(chat.getByText(/No API key on this device/)).toBeTruthy();
  expect(chat.getByRole("combobox", { name: "Model" })).toHaveTextContent("chat-model");
  await user.click(chat.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Other model" }));
  expect(state.setFeatureModel).toHaveBeenCalledWith("assistant", {
    source: "cloud",
    providerId: "p",
    modelId: "other-model",
  });
});

test("session title defaults to following chat and can independently select cloud", async () => {
  const user = userEvent.setup();
  render(<FeatureModelSettings features={["sessionTitle"]} />);
  const sessionTitle = within(screen.getByRole("group", { name: "Conversation titles" }));
  expect(sessionTitle.queryByLabelText("Local model")).toBeNull();
  expect(sessionTitle.getByRole("combobox", { name: "Execution" })).toHaveTextContent(
    "Follow chat model",
  );
  await user.click(sessionTitle.getByLabelText("Execution"));
  await user.click(await screen.findByRole("option", { name: "Cloud" }));
  expect(state.setFeatureModel).toHaveBeenCalledWith("sessionTitle", {
    source: "cloud",
    providerId: "p",
    modelId: "chat-model",
  });
});

test("failed model loading keeps the saved selection and offers retry", async () => {
  state.catalog.mockReturnValue({
    models: [],
    loading: false,
    error: "Could not load models.",
    reload: state.reload,
  });
  const user = userEvent.setup();
  render(<FeatureModelSettings features={["assistant"]} />);
  expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("chat-model");
  expect(screen.getByText("Could not load models.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.reload).toHaveBeenCalledOnce();
  expect(state.setFeatureModel).not.toHaveBeenCalled();
});

test("selecting local execution warns when its model has not been downloaded", async () => {
  const user = userEvent.setup();
  render(<FeatureModelSettings features={["sessionTitle"]} />);
  await user.click(screen.getByRole("combobox", { name: "Execution" }));
  await user.click(await screen.findByRole("option", { name: "On this device" }));
  expect(state.setFeatureModel).toHaveBeenCalledWith("sessionTitle", {
    source: "local",
    modelId: "gemma-4-e2b-it-onnx",
  });
  await waitFor(() =>
    expect(state.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Gemma needs to be downloaded" }),
    ),
  );
});

test("changing to another local model checks that model's download", async () => {
  state.localSessionTitle = true;
  const user = userEvent.setup();
  render(<FeatureModelSettings features={["sessionTitle"]} />);
  await user.click(screen.getByRole("combobox", { name: "Local model" }));
  await user.click(await screen.findByRole("option", { name: "Qwen" }));
  await waitFor(() =>
    expect(state.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Qwen needs to be downloaded" }),
    ),
  );
  expect(state.cache).toHaveBeenCalledExactlyOnceWith("qwen3.5-0.8b-onnx-opt");
});

test("auto-selects the first provider for chat when enabled and none is chosen yet", async () => {
  state.assistantProviderId = "";
  render(<FeatureModelSettings features={["assistant"]} autoSelectFirstProvider />);
  await waitFor(() =>
    expect(state.setFeatureModel).toHaveBeenCalledWith("assistant", {
      source: "cloud",
      providerId: "p",
      modelId: "",
    }),
  );
});

test("does not auto-select a provider when the flag is off", () => {
  state.assistantProviderId = "";
  render(<FeatureModelSettings features={["assistant"]} />);
  expect(state.setFeatureModel).not.toHaveBeenCalled();
});
