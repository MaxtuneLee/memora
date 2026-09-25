import { useEffect } from "react";

// Per-page title, description, and canonical URL for this single-page site. Search engines that
// render JavaScript pick these up; link-preview scrapers see the defaults in index.html.
export const SITE_URL = "https://memora.xox.im";

function setMeta(selector: string, attr: "content" | "href", value: string): void {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

export function usePageMeta({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): void {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);

    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.append(robots);
      }
      robots.content = "noindex";
    } else {
      robots?.remove();
    }
  }, [title, description, path, noindex]);
}
