// The hosts a widget may load scripts from, matching the "CDN allowlist" line in the
// show-widget-skills docs. The runner page enforces the same list in its Content-Security-Policy
// (widget-runner.html), and both the host and the runner filter script tags against it.
export const WIDGET_CDN_HOSTS = [
  "cdnjs.cloudflare.com",
  "esm.sh",
  "cdn.jsdelivr.net",
  "unpkg.com",
] as const;

// Returns the normalized, allowlisted URL to load, or null to drop the script entirely.
export const getAllowedCdnScriptHref = (src: string): string | null => {
  try {
    const url = new URL(src);
    return url.protocol === "https:" &&
      (WIDGET_CDN_HOSTS as readonly string[]).includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
};
