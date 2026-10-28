import { describe, expect, it } from "vite-plus/test";

import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";
import { getAllowedCdnScriptHref } from "@/lib/widgets/sandbox/cdnAllowlist";
import { buildWidgetScripts } from "@/lib/widgets/sandbox/payload";

describe("getAllowedCdnScriptHref", () => {
  it("allows https scripts from the documented hosts", () => {
    expect(getAllowedCdnScriptHref("https://cdn.jsdelivr.net/npm/chart.js")).toBe(
      "https://cdn.jsdelivr.net/npm/chart.js",
    );
    expect(getAllowedCdnScriptHref("https://esm.sh/d3")).toBe("https://esm.sh/d3");
  });

  it("drops other hosts, plain http, and look-alike hosts", () => {
    expect(getAllowedCdnScriptHref("https://evil.example/a.js")).toBeNull();
    expect(getAllowedCdnScriptHref("http://cdn.jsdelivr.net/a.js")).toBeNull();
    expect(getAllowedCdnScriptHref("https://cdn.jsdelivr.net.evil.example/a.js")).toBeNull();
    expect(getAllowedCdnScriptHref("javascript:alert(1)")).toBeNull();
  });
});

describe("buildWidgetScripts", () => {
  it("puts allowlisted external scripts first and joins inline scripts into one", () => {
    const parsed = parseShowWidgetCode(
      '<div></div><script>const a = 1;</script><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><script>const b = 2;</script>',
    );

    expect(buildWidgetScripts(parsed)).toEqual([
      { src: "https://cdn.jsdelivr.net/npm/chart.js" },
      { content: "const a = 1;\n\nconst b = 2;" },
    ]);
  });

  it("drops a script from a host that is not allowed", () => {
    const parsed = parseShowWidgetCode(
      '<div></div><script src="https://evil.example/a.js"></script><script>run();</script>',
    );

    expect(buildWidgetScripts(parsed)).toEqual([{ content: "run();" }]);
  });

  it("returns no scripts for markup only", () => {
    expect(buildWidgetScripts(parseShowWidgetCode("<div>hi</div>"))).toEqual([]);
  });
});
