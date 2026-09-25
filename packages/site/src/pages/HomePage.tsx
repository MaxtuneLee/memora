import type { ReactElement } from "react";

import { usePageMeta } from "../lib/pageMeta";
import { Closing } from "../sections/Closing";
import { Features } from "../sections/Features";
import { Files } from "../sections/Files";
import { Hero } from "../sections/Hero";
import { Transcripts } from "../sections/Transcripts";
import { Widgets } from "../sections/Widgets";

export function HomePage(): ReactElement {
  usePageMeta({
    title: "Memora: a learning workspace in your browser",
    description:
      "Keep lectures, papers, and photos in one library, get word-level transcripts, and ask questions about your own material. Free, no sign-up.",
    path: "/",
  });
  return (
    <>
      <Hero />
      <Features />
      <Files />
      <Transcripts />
      <Widgets />
      <Closing />
    </>
  );
}
