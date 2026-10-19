import type { ResolvedTheme } from "@/lib/theme/documentTheme";

// Opaque origin on purpose: without allow-same-origin the runner gets no storage shared between
// widgets, and a widget cannot reach the host even if the runner is ever served from the app's
// own origin.
export const WIDGET_SANDBOX_ATTRIBUTE = "allow-scripts allow-forms";

// Served by the app itself (widget-runner.html is a second entry of the web build). The runner
// is sandboxed here too, but it shares a process with the app, so a widget that never returns
// freezes the app.
export const LOCAL_RUNNER_PATH = "/widget-runner.html";

export interface WidgetSandboxTarget {
  url: string;
  // True when the runner is on another site than the app, which is what gets it a process of its
  // own in browsers that isolate sites.
  isolated: boolean;
}

const hostnameLabels = (hostname: string): string[] => hostname.split(".").filter(Boolean);

// Whether two hostnames could be the same site. Without the public suffix list this only compares
// the last two labels, so it can call a pair "same site" that is not (a.co.uk and b.co.uk) but
// never the reverse in a way that matters: a false "same site" only produces a console warning.
export const mayShareSite = (first: string, second: string): boolean => {
  if (first === second) {
    return true;
  }
  const firstLabels = hostnameLabels(first);
  const secondLabels = hostnameLabels(second);
  return (
    firstLabels.slice(-2).join(".") === secondLabels.slice(-2).join(".") &&
    firstLabels.length > 1 &&
    secondLabels.length > 1
  );
};

const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

export const resolveWidgetSandboxTarget = ({
  configuredUrl = import.meta.env.VITE_WIDGET_SANDBOX_URL,
  appOrigin = window.location.origin,
  online = navigator.onLine,
}: {
  configuredUrl?: string;
  appOrigin?: string;
  online?: boolean;
} = {}): WidgetSandboxTarget => {
  const local: WidgetSandboxTarget = { url: LOCAL_RUNNER_PATH, isolated: false };
  const trimmed = configuredUrl?.trim();
  // Offline the remote runner cannot load, but the one the service worker cached can.
  if (!trimmed || !online) {
    return local;
  }

  try {
    const remote = new URL(trimmed);
    const app = new URL(appOrigin);
    if (remote.protocol !== "https:" && !isLoopbackHost(remote.hostname)) {
      return local;
    }
    if (remote.origin === app.origin) {
      return local;
    }
    if (!isLoopbackHost(remote.hostname) && mayShareSite(remote.hostname, app.hostname)) {
      console.warn(
        `The widget sandbox ${remote.hostname} may be on the same site as ${app.hostname}, so widgets might share a process with the app. Use a different registrable domain.`,
      );
    }
    return { url: remote.href, isolated: true };
  } catch {
    return local;
  }
};

// The first theme goes in the URL fragment (never sent to the server) so the runner's first paint
// already matches the app. Later changes arrive as messages and never reload the frame.
export const buildRunnerSrc = (
  target: WidgetSandboxTarget,
  theme: ResolvedTheme,
  appOrigin: string = window.location.origin,
): string => {
  const url = new URL(target.url, appOrigin);
  url.hash = `theme=${theme === "dark" ? "dark" : "light"}`;
  return target.isolated ? url.href : `${url.pathname}${url.search}${url.hash}`;
};
