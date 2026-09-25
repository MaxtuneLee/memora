import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

const REPORT_MESSAGE_TYPE = "memora-test:write-data-report";

function WriteDataHarness({
  onWriteData,
  widgetCode,
}: {
  onWriteData?: (name: string, content: string) => Promise<WriteWidgetDataResult>;
  widgetCode: string;
}): JSX.Element {
  return (
    <GeneratedWidgetFrame
      widgetCode={widgetCode}
      data={null}
      title="Write data test widget"
      onWriteData={onWriteData}
    />
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
});

// These tests prove the postMessage write-channel protocol through a real sandboxed iframe:
// a request reaches the host, a refusal round-trips back to the *rejected promise* the widget's
// own script is awaiting, and same-name calls coalesce. They use a stand-in `onWriteData`
// handler rather than the real `writeWidgetDataFile` — that function's folder-scoping and
// cross-Definition isolation (a write can never even name another Definition's folder, since
// writeData(name, content) has no folderId parameter at all) is exercised directly, with a real
// LiveStore-shaped fake store, in test/widgets/widgetDataFile.test.ts. jsdom can't run a real
// iframe's injected <script>, which is why that data-layer coverage lives in a plain unit test
// rather than here.
describe("Generated Home Grid widget write channel", () => {
  it("round-trips a successful write and delivers a refusal for an undeclared name back to the widget", async () => {
    // Stands in for a host handler bound to one Definition's own folder: only "a.json" is
    // declared for it, so anything else is refused without ever touching storage, mirroring how
    // each GeneratedWidgetTile's onWriteData closure is scoped to exactly one folderId (ADR 0008;
    // see widgetDataFile.test.ts for the real cross-Definition isolation proof).
    const writes: Array<{ name: string; content: string }> = [];
    const onWriteData = async (name: string, content: string): Promise<WriteWidgetDataResult> => {
      if (name !== "a.json") {
        return { ok: false, error: `"${name}" is not a declared data file for this widget.` };
      }
      writes.push({ name, content });
      return { ok: true };
    };

    const widgetCode = `<script>
writeData("a.json", "hello").then(function () {
  window.parent.postMessage({ type: "${REPORT_MESSAGE_TYPE}", kind: "ok", name: "a.json" }, "*");
});
writeData("b.json", "hello").catch(function (error) {
  window.parent.postMessage(
    { type: "${REPORT_MESSAGE_TYPE}", kind: "error", name: "b.json", message: error.message },
    "*",
  );
});
</script>`;

    const reports: Array<{ kind: string; name: string; message?: string }> = [];
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === REPORT_MESSAGE_TYPE) {
        reports.push(event.data);
      }
    };
    window.addEventListener("message", handleMessage);

    try {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(<WriteDataHarness widgetCode={widgetCode} onWriteData={onWriteData} />);

      await expect.poll(() => reports.length, { timeout: 5000 }).toBe(2);
      const ok = reports.find((report) => report.kind === "ok");
      const error = reports.find((report) => report.kind === "error");
      expect(ok).toMatchObject({ name: "a.json" });
      expect(error?.message).toContain("not a declared data file");
      expect(writes).toEqual([{ name: "a.json", content: "hello" }]);
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });

  it("refuses every write when the host provides no write handler at all", async () => {
    const widgetCode = `<script>
writeData("state.json", "x").catch(function (error) {
  window.parent.postMessage({ type: "${REPORT_MESSAGE_TYPE}", message: error.message }, "*");
});
</script>`;

    const reports: Array<{ message: string }> = [];
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === REPORT_MESSAGE_TYPE) {
        reports.push(event.data);
      }
    };
    window.addEventListener("message", handleMessage);

    try {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(<WriteDataHarness widgetCode={widgetCode} />);

      await expect.poll(() => reports.length, { timeout: 5000 }).toBeGreaterThan(0);
      expect(reports[0]?.message).toContain("cannot write data");
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });

  it("coalesces rapid writes to the same name into one trailing call instead of queueing every one", async () => {
    let resolveFirst: (() => void) | undefined;
    const calls: string[] = [];
    const onWriteData = (_name: string, content: string): Promise<WriteWidgetDataResult> => {
      calls.push(content);
      if (calls.length === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve({ ok: true });
        });
      }
      return Promise.resolve({ ok: true });
    };

    const widgetCode = `<script>
writeData("state.json", "1");
writeData("state.json", "2");
writeData("state.json", "3").then(function () {
  window.parent.postMessage({ type: "${REPORT_MESSAGE_TYPE}" }, "*");
});
</script>`;

    const reports: unknown[] = [];
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === REPORT_MESSAGE_TYPE) {
        reports.push(event.data);
      }
    };
    window.addEventListener("message", handleMessage);

    try {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(<WriteDataHarness widgetCode={widgetCode} onWriteData={onWriteData} />);

      // Only the first call ("1") should have reached the host yet — "2" and "3" queue behind it,
      // and coalesce to the latest content ("3") once "1" resolves.
      await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1);
      expect(calls).toEqual(["1"]);

      resolveFirst?.();

      await expect.poll(() => reports.length, { timeout: 5000 }).toBeGreaterThan(0);
      expect(calls).toEqual(["1", "3"]);
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });
});
