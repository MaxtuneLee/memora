import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { findModelsDevMetadata, parseModelsDevCatalog } from "@/lib/models/modelsDevCatalog";

const MODELS_DEV_URL = "https://models.dev/api.json";
const fetchMock = vi.fn<typeof fetch>();
const rawModel = (output = 128_000) => ({
  name: "New model",
  canonical_model_id: "openai/test-new-model",
  limit: { context: 1_050_000, output },
  reasoning: true,
  reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }],
  modalities: { input: ["text", "image", "pdf"] },
  cost: { input: 0.1, output: 0.5, cache_read: 0.01 },
  headers: { Authorization: "must-not-survive" },
});
const liveCatalog = () => ({ openai: { models: { "test-new-model": rawModel() } } });
const discover = async () => (await import("@/lib/settings/providerModels")).fetchProviderModels;

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("uses bundled Luna metadata without a models.dev request", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: [{ id: "gpt-6-luna" }] }));
  const fetchModels = await discover();
  const [model] = await fetchModels("https://api.openai.com/v1", "device-key");
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(model).toMatchObject({
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    reasoning: true,
    input: ["text", "image"],
    thinkingLevelMap: { off: "none", minimal: null, low: "low", max: "max" },
  });
});

test("fetches a missing model and reuses the new catalog without leaking provider credentials", async () => {
  fetchMock.mockImplementation(async (url) =>
    Response.json(url === MODELS_DEV_URL ? liveCatalog() : { data: [{ id: "test-new-model" }] }),
  );
  const fetchModels = await discover();
  const [model] = await fetchModels("https://api.openai.com/v1", "device-secret");
  expect(model).toMatchObject({
    maxTokens: 128_000,
    reasoning: true,
    thinkingLevelMap: { off: "none" },
  });
  expect(JSON.stringify(model)).not.toMatch(/must-not-survive|device-secret|Authorization/);
  expect(fetchMock).toHaveBeenCalledWith(
    MODELS_DEV_URL,
    expect.objectContaining({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: expect.any(AbortSignal),
    }),
  );
  const catalogOptions = fetchMock.mock.calls.find(([url]) => url === MODELS_DEV_URL)?.[1];
  expect(catalogOptions?.headers).toBeUndefined();
  await fetchModels("https://api.openai.com/v1", "device-secret");
  expect(fetchMock.mock.calls.filter(([url]) => url === MODELS_DEV_URL)).toHaveLength(1);
});

test("shares one catalog refresh across different concurrent provider discoveries", async () => {
  let resolveCatalog: (response: Response) => void = () => {};
  fetchMock.mockImplementation(async (url) => {
    if (url === MODELS_DEV_URL)
      return new Promise<Response>((resolve) => {
        resolveCatalog = resolve;
      });
    return Response.json({ data: [{ id: "test-new-model" }] });
  });
  const fetchModels = await discover();
  const first = fetchModels("https://api.openai.com/v1", "first-key");
  const second = fetchModels("https://custom-gateway.test/v1", "second-key");
  await vi.waitFor(() =>
    expect(fetchMock.mock.calls.filter(([url]) => url === MODELS_DEV_URL)).toHaveLength(1),
  );
  resolveCatalog(Response.json(liveCatalog()));
  const results = await Promise.all([first, second]);
  expect(results.map((models) => models[0].maxTokens)).toEqual([128_000, 128_000]);
});

test.each(["offline", "http-error", "malformed"])(
  "keeps cached metadata and defaults after %s, and retries later",
  async (failure) => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    fetchMock.mockImplementation(async (url) => {
      if (url !== MODELS_DEV_URL)
        return Response.json({ data: [{ id: "gpt-6-luna" }, { id: "test-new-model" }] });
      if (failure === "offline") throw new TypeError("offline");
      if (failure === "http-error") return new Response(null, { status: 503 });
      return Response.json({ data: [] });
    });
    const fetchModels = await discover();
    const models = await fetchModels("https://api.openai.com/v1", "");
    expect(models.map((model) => model.maxTokens)).toEqual([128_000, 4096]);
    await fetchModels("https://api.openai.com/v1", "");
    expect(fetchMock.mock.calls.filter(([url]) => url === MODELS_DEV_URL)).toHaveLength(1);
    now += 5 * 60_000;
    fetchMock.mockImplementation(async (url) =>
      Response.json(url === MODELS_DEV_URL ? liveCatalog() : { data: [{ id: "test-new-model" }] }),
    );
    expect((await fetchModels("https://api.openai.com/v1", ""))[0].maxTokens).toBe(128_000);
    expect(fetchMock.mock.calls.filter(([url]) => url === MODELS_DEV_URL)).toHaveLength(2);
  },
);

test("does not refetch repeatedly when a successful refresh still lacks a model", async () => {
  fetchMock.mockImplementation(async (url) =>
    Response.json(
      url === MODELS_DEV_URL ? liveCatalog() : { data: [{ id: "still-unknown-model" }] },
    ),
  );
  const fetchModels = await discover();
  await fetchModels("https://api.openai.com/v1", "");
  await fetchModels("https://api.openai.com/v1", "");
  expect(fetchMock.mock.calls.filter(([url]) => url === MODELS_DEV_URL)).toHaveLength(1);
});

test("keeps explicit discovery limits and false capabilities over the catalog", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      data: [
        {
          id: "gpt-6-luna",
          max_output_tokens: 2048,
          reasoning: false,
          input: ["text"],
          cost: { input: 0 },
        },
      ],
    }),
  );
  const fetchModels = await discover();
  const [model] = await fetchModels("https://api.openai.com/v1", "");
  expect(model).toMatchObject({
    maxTokens: 2048,
    contextWindow: 1_050_000,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0.5 },
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("scopes identical model IDs to the provider endpoint and preserves the owner for a custom gateway", () => {
  const catalog = parseModelsDevCatalog({
    reseller: { api: "https://reseller.test/v1", models: { "test-new-model": rawModel(1000) } },
    ...liveCatalog(),
  });
  expect(
    findModelsDevMetadata(catalog, "https://api.openai.com/v1/", "test-new-model")?.maxTokens,
  ).toBe(128_000);
  expect(
    findModelsDevMetadata(catalog, "https://reseller.test/v1", "test-new-model")?.maxTokens,
  ).toBe(1000);
  expect(
    findModelsDevMetadata(catalog, "https://custom.test/v1", "test-new-model")?.maxTokens,
  ).toBe(128_000);
  expect(
    findModelsDevMetadata(catalog, "https://api.openai.com/v1", "constructor"),
  ).toBeUndefined();
});

test("rejects invalid catalogs and ignores invalid limits and unsafe metadata", () => {
  expect(() => parseModelsDevCatalog([])).toThrow();
  expect(() =>
    parseModelsDevCatalog({ openai: { models: { broken: { limit: { output: -1 } } } } }),
  ).toThrow();
  const catalog = parseModelsDevCatalog(liveCatalog());
  expect(JSON.stringify(catalog)).not.toContain("must-not-survive");
  expect(catalog[0].models["test-new-model"].input).toEqual(["text", "image"]);
});
