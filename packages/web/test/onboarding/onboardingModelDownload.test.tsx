// @vitest-environment jsdom
import { Toast } from "@base-ui/react/toast";
import { gemma4E2bOnnxManifest, qwen35OnnxOptManifest } from "@memora/local-model-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import OnboardingExperience from "@/components/onboarding/OnboardingExperience";
import type { LocalModelOption } from "@/lib/local-model";
import type { LocalModelDownloadState } from "@/lib/local-model/downloadState";

const downloads = vi.hoisted(() => ({
  read: vi.fn<(modelId: string) => LocalModelDownloadState | undefined>(),
  start: vi.fn(),
}));
vi.mock("@/hooks/settings/useLocalModelDownloadSettings", () => ({
  useLocalModelDownloadState: downloads.read,
}));
vi.mock("@/components/settings/FeatureModelSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/ProviderManagementSection", () => ({ default: () => null }));
vi.mock("streamdown", () => ({ Streamdown: () => null }));
vi.mock("@/lib/streamdown", () => ({
  MEMORA_STREAMDOWN_CLASS_NAME: "",
  MEMORA_STREAMDOWN_CONTROLS: {},
  MEMORA_STREAMDOWN_PLUGINS: {},
  MEMORA_STREAMDOWN_THEME: [],
}));

const qwen: LocalModelOption = {
  id: qwen35OnnxOptManifest.id,
  name: qwen35OnnxOptManifest.displayName,
  manifest: qwen35OnnxOptManifest,
};
const gemma: LocalModelOption = {
  id: gemma4E2bOnnxManifest.id,
  name: gemma4E2bOnnxManifest.displayName,
  manifest: gemma4E2bOnnxManifest,
};

function Fixture({ models }: { models: LocalModelOption[] }) {
  return (
    <MemoryRouter>
      <Toast.Provider>
        <OnboardingExperience
          isSaving={false}
          errorMessage={null}
          streamingSoulDocument=""
          providers={[]}
          getProviderApiKey={() => ""}
          localModelOptions={models}
          requiredModelsReady={false}
          onDownloadLocalModel={downloads.start}
          onCreateProvider={() => {}}
          onUpdateProvider={() => {}}
          onDeleteProvider={() => {}}
          onFetchProviderModels={() => {}}
          onComplete={async () => {}}
        />
      </Toast.Provider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  downloads.read.mockReturnValue({ status: "not-cached" });
});
afterEach(cleanup);

test.each([qwen, gemma])("shows and downloads the selected $name model", async (model) => {
  const user = userEvent.setup();
  render(<Fixture models={[model]} />);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByRole("heading", { name: model.name })).toBeTruthy();
  expect(screen.getByText(model.manifest.modelId)).toBeTruthy();
  expect(screen.queryByText(/local audio transcription/i)).toBeNull();
  expect(downloads.read).toHaveBeenLastCalledWith(model.id);
  await user.click(screen.getByRole("button", { name: "Download" }));
  expect(downloads.start).toHaveBeenCalledExactlyOnceWith(model.id);
});

test("updates model details and progress when selection changes, and hides downloads for cloud", async () => {
  downloads.read.mockImplementation((modelId) =>
    modelId === qwen.id ? { status: "downloading", progress: 37 } : { status: "cached" },
  );
  const user = userEvent.setup();
  const { rerender } = render(<Fixture models={[qwen]} />);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("37%")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Downloading..." })).toBeDisabled();

  rerender(<Fixture models={[gemma]} />);
  expect(screen.queryByRole("heading", { name: qwen.name })).toBeNull();
  expect(screen.getByRole("heading", { name: gemma.name })).toBeTruthy();
  expect(screen.queryByText("37%")).toBeNull();
  expect(screen.getByRole("button", { name: "Ready" })).toBeDisabled();
  expect(downloads.read).toHaveBeenLastCalledWith(gemma.id);

  rerender(<Fixture models={[]} />);
  expect(screen.queryByRole("heading", { name: gemma.name })).toBeNull();
  expect(screen.queryByRole("button", { name: /Download|Ready/ })).toBeNull();
});
