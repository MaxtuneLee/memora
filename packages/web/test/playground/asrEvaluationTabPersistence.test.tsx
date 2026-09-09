// @vitest-environment jsdom
import { Tabs } from "@base-ui/react/tabs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import AsrEvaluation from "@/components/playground/AsrEvaluation";
import { NEMOTRON_MODEL_ID } from "@/lib/playground/nemotron/sessionManager";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/playground/datasetClient", () => ({
  datasetClient: { list: mock.list },
}));
vi.mock("@/lib/playground/evaluationClient", () => ({
  evaluationClient: { run: mock.run },
}));
vi.mock("@memora/evaluation", () => ({
  listEvaluationResults: vi.fn().mockResolvedValue([]),
  readEvaluationResult: vi.fn(),
  saveEvaluationResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@memora/local-model-runtime", () => ({
  whisperBaseTimestampedManifest: { id: "whisper-base-timestamped" },
}));
vi.mock("@/lib/playground/downloadEvaluationJson", () => ({
  downloadEvaluationJson: vi.fn(),
}));

const installed = {
  datasetId: "google/fleurs",
  revision: "main",
  configuration: "en_us",
  split: "validation",
  source: "huggingface" as const,
  size: 1024,
  examples: 394,
  installedAt: new Date(0).toISOString(),
};

function Fixture({ activeTab }: { activeTab: string }) {
  return (
    <Tabs.Root value={activeTab}>
      <Tabs.Panel value="local-models" keepMounted>
        <AsrEvaluation />
      </Tabs.Panel>
      <Tabs.Panel value="ocr" keepMounted>
        <div>OCR panel</div>
      </Tabs.Panel>
    </Tabs.Root>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.list.mockResolvedValue([installed]);
  mock.run.mockImplementation(() => new Promise(() => {}));
});
afterEach(cleanup);

test("switching Playground tabs keeps an in-flight ASR evaluation running instead of aborting it", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Fixture activeTab="local-models" />);

  await screen.findByText(/google\/fleurs/);
  await user.clear(screen.getByLabelText("ASR language"));
  await user.type(screen.getByLabelText("ASR language"), "en");
  await user.click(screen.getByRole("button", { name: "Run evaluation" }));

  expect(mock.run).toHaveBeenCalledOnce();
  const signal: AbortSignal = mock.run.mock.calls[0]?.[3]?.signal;
  expect(signal.aborted).toBe(false);

  rerender(<Fixture activeTab="ocr" />);
  rerender(<Fixture activeTab="local-models" />);

  expect(signal.aborted).toBe(false);
  expect(screen.getByLabelText("ASR language")).toHaveValue("en");
});

test("selecting Nemotron routes evaluationClient.run to the Nemotron model id", async () => {
  const user = userEvent.setup();
  render(<Fixture activeTab="local-models" />);

  await screen.findByText(/google\/fleurs/);
  await user.selectOptions(screen.getByLabelText("Model"), "Nemotron");
  await user.clear(screen.getByLabelText("ASR language"));
  await user.type(screen.getByLabelText("ASR language"), "en");
  await user.click(screen.getByRole("button", { name: "Run evaluation" }));

  expect(mock.run).toHaveBeenCalledOnce();
  expect(mock.run.mock.calls[0]?.[1]).toBe(NEMOTRON_MODEL_ID);
});
