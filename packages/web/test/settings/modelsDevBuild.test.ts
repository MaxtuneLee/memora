import { Buffer } from "node:buffer";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { build } from "vite";

import { modelsDevCatalogPlugin } from "../../plugins/modelsDevCatalogPlugin";
import type { ModelsDevCatalog } from "@/lib/models/modelsDevCatalog";

const buildCatalog = async (): Promise<ModelsDevCatalog> => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [modelsDevCatalogPlugin()],
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: "virtual:models-dev-catalog", preserveEntrySignatures: "strict" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs
    .flatMap((output) => ("output" in output ? output.output : []))
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");
  const module: { default: ModelsDevCatalog } = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  return module.default;
};

afterEach(() => vi.unstubAllGlobals());

test("embeds the current models.dev catalog at build time", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      openai: { models: { "build-time-model": { limit: { context: 200_000, output: 64_000 } } } },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const catalog = await buildCatalog();
  expect(catalog).toEqual([
    { id: "openai", models: { "build-time-model": { contextWindow: 200_000, maxTokens: 64_000 } } },
  ]);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "https://models.dev/api.json",
    expect.objectContaining({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: expect.any(AbortSignal),
    }),
  );
});

test("can still build offline using the saved snapshot", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const catalog = await buildCatalog();
  expect(catalog.find((provider) => provider.id === "openai")?.models["gpt-6-luna"]).toMatchObject({
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  });
});
