// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import SettingsModelRoutingSection from "@/components/settings/SettingsModelRoutingSection";

const state = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@/livestore/store", () => ({ useAppStore: () => state }));
vi.mock("@/components/settings/FeatureModelSettings", () => ({
  default: () => <div>Feature choices</div>,
}));
afterEach(cleanup);

test("shows four actual metrics above feature choices and updates", () => {
  state.useQuery.mockReturnValue({
    localModelTokenUsage: {
      inputTokens: 1200,
      outputTokens: 345,
      allInputTokens: 2000,
      allOutputTokens: 500,
      totalCommands: 2927,
    },
  });
  const { rerender } = render(<SettingsModelRoutingSection />);
  expect(screen.getByText("Total commands").nextElementSibling).toHaveTextContent("2,927");
  expect(screen.getByText("Input tokens").nextElementSibling).toHaveTextContent("2K");
  expect(screen.getByText("Output tokens").nextElementSibling).toHaveTextContent("500");
  const counter = screen.getByText("1.5K (61.8%)");
  expect(
    counter.compareDocumentPosition(screen.getByText("Feature choices")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  state.useQuery.mockReturnValue({
    localModelTokenUsage: {
      inputTokens: 1200,
      outputTokens: 445,
      allInputTokens: 2100,
      allOutputTokens: 600,
      totalCommands: 2928,
    },
  });
  rerender(<SettingsModelRoutingSection />);
  expect(screen.getByText("Tokens saved").nextElementSibling).toHaveTextContent("1.6K (60.9%)");
  expect(screen.getByText("Total commands").nextElementSibling).toHaveTextContent("2,928");
});

test("starts at zero when historical usage is unavailable", () => {
  state.useQuery.mockReturnValue({});
  render(<SettingsModelRoutingSection />);
  expect(screen.getByText("Tokens saved").nextElementSibling).toHaveTextContent("0 (0.0%)");
  expect(screen.getAllByText("0")).toHaveLength(3);
});

test("formats millions compactly without guessing historical command counts", () => {
  state.useQuery.mockReturnValue({
    localModelTokenUsage: {
      inputTokens: 9000000,
      outputTokens: 1300000,
      allInputTokens: 11600000,
      allOutputTokens: 1400000,
    },
  });
  render(<SettingsModelRoutingSection />);
  expect(screen.getByText("Input tokens").nextElementSibling).toHaveTextContent("11.6M");
  expect(screen.getByText("Output tokens").nextElementSibling).toHaveTextContent("1.4M");
  expect(screen.getByText("Tokens saved").nextElementSibling).toHaveTextContent("10.3M (79.2%)");
  expect(screen.getByText("Total commands").nextElementSibling).toHaveTextContent("—");
});
