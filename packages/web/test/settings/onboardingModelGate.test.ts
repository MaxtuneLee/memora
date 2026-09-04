import { beforeEach, expect, test, vi } from "vite-plus/test";
import { getOnboardingGateStatus } from "@/lib/onboarding/onboardingGate";

const memory = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/settings/personalityStorage", () => ({ loadGlobalMemoryData: memory.load }));
beforeEach(() => vi.clearAllMocks());

test("completed onboarding does not depend on local model caches or personality files", async () => {
  expect((await getOnboardingGateStatus(true)).ready).toBe(true);
  expect(memory.load).not.toHaveBeenCalled();
});
test("existing profiles remain usable without local model downloads", async () => {
  memory.load.mockResolvedValue({ personality: "Existing profile", notices: [] });
  expect((await getOnboardingGateStatus()).ready).toBe(true);
});
test("a new workspace still enters onboarding", async () => {
  memory.load.mockResolvedValue(null);
  expect((await getOnboardingGateStatus()).ready).toBe(false);
});
