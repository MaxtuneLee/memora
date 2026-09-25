import type { ReactElement } from "react";
import { Link } from "react-router";

import { usePageMeta } from "../lib/pageMeta";

export function NotFound(): ReactElement {
  usePageMeta({
    title: "Page not found · Memora",
    description: "This page doesn't exist.",
    path: "/",
    noindex: true,
  });
  return (
    <section className="page-head">
      <div className="wrap">
        <h1 className="page-title">
          This page <em>wandered off.</em>
        </h1>
        <p className="lede">The link may be old, or it points at something only the app has.</p>
        <div className="actions">
          <Link className="btn btn-primary" to="/">
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
