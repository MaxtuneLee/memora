import type { ReactElement } from "react";

import { APP_URL } from "../lib/links";
import { Matrix } from "../lib/Matrix";
import { usePageMeta } from "../lib/pageMeta";

const art = (rows: string[]) => (c: number, r: number) => (rows[r]?.[c] === "#" ? "on" : "");

// Three small pixel icons: no account, nothing to install, your own key.
const POINTS: Array<{ title: string; text: string; icon: string[] }> = [
  {
    title: "No sign-up",
    text: "No account, no email, no password.",
    icon: [
      ".........",
      "...###...",
      "..#...#..",
      "..#...#..",
      "...###...",
      ".#######.",
      "#.......#",
      "#.......#",
      "#########",
    ],
  },
  {
    title: "No download",
    text: "Nothing to install. Nothing to update.",
    icon: [
      ".........",
      "....#....",
      "....#....",
      "....#....",
      "..#.#.#..",
      "...###...",
      "....#....",
      ".........",
      "#########",
    ],
  },
  {
    title: "Bring your own key",
    text: "Use local models, or plug in your own API key.",
    icon: [
      ".........",
      ".###.....",
      "#...#....",
      "#...#####",
      "#...#.#.#",
      ".###..#.#",
      ".........",
      ".........",
    ],
  },
];

export function Pricing(): ReactElement {
  usePageMeta({
    title: "Pricing · Memora",
    description:
      "Memora is free, without limits. No sign-up, no download: open the page and start. Bring your own API key for chat.",
    path: "/pricing",
  });
  return (
    <section className="page-head pricing-page">
      <div className="wrap">
        <h1 className="page-title">
          Free, <em>without limits.</em>
        </h1>
        <p className="lede">No sign-up. No download. Just open the page and start.</p>
        <div className="points">
          {POINTS.map((p) => (
            <div key={p.title} className="point">
              <Matrix cols={9} rows={9} cell={art(p.icon)} className="point-mx" />
              <h2>{p.title}</h2>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
        <div className="actions">
          <a className="btn btn-primary" href={APP_URL}>
            Try it yourself
          </a>
        </div>
      </div>
    </section>
  );
}
