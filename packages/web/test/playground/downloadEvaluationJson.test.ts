import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { EvaluationResult } from "@memora/evaluation";

import { downloadEvaluationJson } from "@/lib/playground/downloadEvaluationJson";

const result = {
  formatVersion: 1,
  runId: "run-abc",
  summary: { total: 1, succeeded: 1, failed: 0, canceled: false },
} as unknown as EvaluationResult;

describe("downloadEvaluationJson", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    vi.stubGlobal("document", dom.window.document);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("names the file after the run and triggers a click with the full result as JSON", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadEvaluationJson(result);

    expect(anchor.download).toBe("run-abc.json");
    expect(anchor.href).toBe("blob:fake-url");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

    const [blob] = createObjectURL.mock.calls[0] as [Blob];
    expect(blob.type).toBe("application/json");
  });
});
