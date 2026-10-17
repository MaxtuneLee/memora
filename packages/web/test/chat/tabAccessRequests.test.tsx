// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";

import { requestTabAccess, useTabAccessRequest } from "@/lib/chat/tabAccessRequests";
import type { AccessRequest } from "@/lib/chat/permissions";

afterEach(cleanup);

const request: AccessRequest = {
  tool: "create_document",
  summary: "create a document",
  access: "write",
  target: { kind: "library" },
};

test("cancelling an approval removes only that request and leaves the next usable", async () => {
  const controller = new AbortController();
  const { result } = renderHook(useTabAccessRequest);
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  const next = { ...request, summary: "create another document" };
  act(() => {
    first = requestTabAccess(request, controller.signal);
    second = requestTabAccess(next);
  });
  expect(result.current.request).toBe(request);
  act(() => controller.abort());
  await expect(first).resolves.toBe("deny");
  expect(result.current.request).toBe(next);
  act(() => result.current.decide("allow_once"));
  await expect(second).resolves.toBe("allow_once");
  expect(result.current.request).toBeNull();
});

test("an already cancelled call never asks; abort after a decision cannot remove another call", async () => {
  const controller = new AbortController();
  const { result } = renderHook(useTabAccessRequest);
  let first!: Promise<unknown>;
  act(() => {
    first = requestTabAccess(request, controller.signal);
  });
  act(() => result.current.decide("allow_once"));
  await expect(first).resolves.toBe("allow_once");
  let second!: Promise<unknown>;
  act(() => {
    second = requestTabAccess(request);
  });
  act(() => controller.abort());
  await expect(requestTabAccess(request, controller.signal)).resolves.toBe("deny");
  expect(result.current.request).toBe(request);
  act(() => result.current.decide("deny"));
  await expect(second).resolves.toBe("deny");
});

const read = (tool: string): AccessRequest => ({
  tool,
  summary: "search your files",
  access: "read",
  search: true,
  target: { kind: "library" },
});

test("shows requests oldest first and hands each decision to its caller", async () => {
  const { result } = renderHook(() => useTabAccessRequest());
  expect(result.current.request).toBeNull();

  let first!: Promise<string>;
  let second!: Promise<string>;
  act(() => {
    first = requestTabAccess(read("search_files"));
    second = requestTabAccess(read("grep_files"));
  });
  expect(result.current.request?.tool).toBe("search_files");

  act(() => result.current.decide("allow_library"));
  expect(await first).toBe("allow_library");
  expect(result.current.request?.tool).toBe("grep_files");

  act(() => result.current.decide("deny"));
  expect(await second).toBe("deny");
  expect(result.current.request).toBeNull();
});
