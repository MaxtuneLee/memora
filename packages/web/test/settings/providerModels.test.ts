import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { fetchProviderModels } from "@/lib/settings/providerModels";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

test("fetches and sanitizes compatible API model lists without persisting credentials", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      data: [
        { id: "qwen", name: "Qwen", headers: { Authorization: "secret" } },
        { id: "qwen", name: "Qwen" },
        { id: "" },
      ],
    }),
  );
  const models = await fetchProviderModels("https://example.test/v1/", "device-key");
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "https://example.test/v1/models",
    expect.objectContaining({
      headers: { Authorization: "Bearer device-key" },
      credentials: "omit",
      redirect: "error",
    }),
  );
  expect(models).toHaveLength(1);
  expect(models[0]).toMatchObject({ id: "qwen", name: "Qwen" });
  expect(JSON.stringify(models)).not.toMatch(/secret|Authorization|device-key/);
});

test("shares concurrent requests and refreshes after completion", async () => {
  fetchMock.mockResolvedValue(Response.json({ models: [{ id: "chat" }] }));
  const first = fetchProviderModels("https://example.test/v1", "key");
  const second = fetchProviderModels("https://example.test/v1", "key");
  expect(first).toBe(second);
  await Promise.all([first, second]);
  expect(fetchMock).toHaveBeenCalledOnce();
  fetchMock.mockResolvedValue(Response.json({ data: [] }));
  expect(await fetchProviderModels("https://example.test/v1", "key")).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("rejects malformed responses and permits retry after failure", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ data: {} }));
  await expect(fetchProviderModels("https://example.test/v1", "")).rejects.toThrow(
    "invalid model list",
  );
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(fetchProviderModels("https://example.test/v1", "")).rejects.toThrow("HTTP 401");
  fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
  await expect(fetchProviderModels("https://example.test/v1", "")).resolves.toEqual([]);
});

test("rejects endpoints containing credentials before making a request", async () => {
  await expect(fetchProviderModels("https://example.test/v1?api_key=secret", "")).rejects.toThrow(
    "credentials",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
