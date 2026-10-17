// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import SettingsPermissionsSection from "@/components/settings/SettingsPermissionsSection";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { settingEvents } from "@/livestore/setting";

const store = vi.hoisted(() => ({ useQuery: vi.fn(), commit: vi.fn() }));
vi.mock("@/livestore/store", () => ({ useAppStore: () => store }));
afterEach(cleanup);

test("WebMCP controls default off and save independent device permissions", () => {
  let settings = {};
  store.useQuery.mockImplementation((query) => (query === settingsDocumentQuery$ ? settings : []));
  const { rerender } = render(<SettingsPermissionsSection />);
  const enabled = screen.getByRole("switch", { name: "Enable WebMCP" });
  const read = screen.getByRole("switch", { name: "Allow reading" });
  const write = screen.getByRole("switch", { name: "Allow changes" });
  expect(enabled).not.toBeChecked();
  expect(read).toBeChecked();
  expect(read).toHaveAttribute("aria-disabled", "true");
  expect(write).not.toBeChecked();
  expect(write).toHaveAttribute("aria-disabled", "true");

  fireEvent.click(enabled);
  expect(store.commit).toHaveBeenLastCalledWith(
    settingEvents.deviceSettingsSet({ webMcpEnabled: true }),
  );
  settings = { webMcpEnabled: true };
  rerender(<SettingsPermissionsSection />);
  expect(read).not.toHaveAttribute("aria-disabled", "true");
  expect(write).not.toHaveAttribute("aria-disabled", "true");
  fireEvent.click(write);
  expect(store.commit).toHaveBeenLastCalledWith(
    settingEvents.deviceSettingsSet({ webMcpWriteEnabled: true }),
  );
  fireEvent.click(read);
  expect(store.commit).toHaveBeenLastCalledWith(
    settingEvents.deviceSettingsSet({ webMcpReadEnabled: false }),
  );
});
