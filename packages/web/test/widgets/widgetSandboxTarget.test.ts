import { describe, expect, it } from "vite-plus/test";

import {
  LOCAL_RUNNER_PATH,
  buildRunnerSrc,
  mayShareSite,
  resolveWidgetSandboxTarget,
} from "@/lib/widgets/sandbox/sandboxTarget";

const APP = "https://app.memora.example";

describe("resolveWidgetSandboxTarget", () => {
  it("uses the app's own runner when no sandbox origin is configured", () => {
    expect(
      resolveWidgetSandboxTarget({ configuredUrl: undefined, appOrigin: APP, online: true }),
    ).toEqual({
      url: LOCAL_RUNNER_PATH,
      isolated: false,
    });
    expect(
      resolveWidgetSandboxTarget({ configuredUrl: "  ", appOrigin: APP, online: true }).isolated,
    ).toBe(false);
  });

  it("uses a configured runner on another site", () => {
    expect(
      resolveWidgetSandboxTarget({
        configuredUrl: "https://memora-widgets.example/widget-runner.html",
        appOrigin: APP,
        online: true,
      }),
    ).toEqual({ url: "https://memora-widgets.example/widget-runner.html", isolated: true });
  });

  it("falls back to the local runner while offline", () => {
    expect(
      resolveWidgetSandboxTarget({
        configuredUrl: "https://memora-widgets.example/widget-runner.html",
        appOrigin: APP,
        online: false,
      }).isolated,
    ).toBe(false);
  });

  it("refuses an insecure or same-origin sandbox URL", () => {
    for (const configuredUrl of [
      "http://memora-widgets.example/widget-runner.html",
      "https://app.memora.example/widget-runner.html",
      "not a url",
    ]) {
      expect(
        resolveWidgetSandboxTarget({ configuredUrl, appOrigin: APP, online: true }).isolated,
      ).toBe(false);
    }
  });

  it("allows a loopback address over http for local development", () => {
    expect(
      resolveWidgetSandboxTarget({
        configuredUrl: "http://127.0.0.1:9003/widget-runner.html",
        appOrigin: "http://localhost:9003",
        online: true,
      }).isolated,
    ).toBe(true);
  });
});

describe("mayShareSite", () => {
  it("flags the same host and sibling subdomains", () => {
    expect(mayShareSite("memora.example", "memora.example")).toBe(true);
    expect(mayShareSite("app.memora.example", "widgets.memora.example")).toBe(true);
  });

  it("accepts unrelated domains", () => {
    expect(mayShareSite("memora.example", "memora-widgets.example")).toBe(false);
  });
});

describe("buildRunnerSrc", () => {
  it("puts the first theme in the fragment so it is never sent to the server", () => {
    const local = { url: LOCAL_RUNNER_PATH, isolated: false };
    expect(buildRunnerSrc(local, "dark", APP)).toBe("/widget-runner.html#theme=dark");
    expect(buildRunnerSrc(local, "light", APP)).toBe("/widget-runner.html#theme=light");
  });

  it("keeps the full URL for a runner on another site", () => {
    const remote = { url: "https://memora-widgets.example/widget-runner.html", isolated: true };
    expect(buildRunnerSrc(remote, "dark", APP)).toBe(
      "https://memora-widgets.example/widget-runner.html#theme=dark",
    );
  });
});
