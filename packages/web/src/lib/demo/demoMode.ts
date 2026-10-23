import type { RemotePiProviderConfig } from "@memora/ai-provider-pi";

// Demo mode replays prepared data: the live transcript plays a recorded lecture and chat answers
// from a script, so Memora can be shown without a microphone, WebGPU, or a provider account.
const DEMO_STORAGE_KEY = "memora.demoMode";

const DEMO_PROVIDER_BASE_URL = "memora://demo";
export const DEMO_MODEL_ID = "memora-demo";

const readDemoMode = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param !== null) {
      const enabled = param !== "0" && param !== "false";
      if (enabled) window.localStorage.setItem(DEMO_STORAGE_KEY, "1");
      else window.localStorage.removeItem(DEMO_STORAGE_KEY);
      return enabled;
    }
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

// Read once per page load: `?demo` turns it on until `?demo=0` turns it off.
const DEMO_MODE = readDemoMode();

export const isDemoMode = (): boolean => DEMO_MODE;

export const DEMO_PROVIDER_CONFIG: RemotePiProviderConfig = {
  id: "memora-demo",
  name: "Memora demo",
  baseUrl: DEMO_PROVIDER_BASE_URL,
  apiFormat: "chat-completions",
  models: [
    {
      id: DEMO_MODEL_ID,
      name: "Memora demo",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 4096,
    },
  ],
  selectedModelId: DEMO_MODEL_ID,
};

export const isDemoProvider = (provider: Pick<RemotePiProviderConfig, "baseUrl">): boolean =>
  provider.baseUrl === DEMO_PROVIDER_BASE_URL;
