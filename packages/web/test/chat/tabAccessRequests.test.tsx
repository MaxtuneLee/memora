// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vite-plus/test";

import type { AccessRequest } from "@/lib/chat/permissions";
import { requestTabAccess, useTabAccessRequest } from "@/lib/chat/tabAccessRequests";

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
