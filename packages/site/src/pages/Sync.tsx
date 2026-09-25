import type { ReactElement } from "react";

import { Matrix } from "../lib/Matrix";
import { usePageMeta } from "../lib/pageMeta";

const art = (rows: string[]) => (c: number, r: number) => (rows[r]?.[c] === "#" ? "on" : "");

const LAPTOP = [
  "..........",
  ".########.",
  ".#......#.",
  ".#......#.",
  ".#......#.",
  ".########.",
  "##########",
  "..........",
];
const CLOUD = [
  "....###...",
  "...#...#..",
  ".###...##.",
  "#........#",
  "#........#",
  ".########.",
  "..........",
  "..........",
];
const PHONE = [
  "...####...",
  "..#....#..",
  "..#....#..",
  "..#....#..",
  "..#....#..",
  "..#....#..",
  "..#.##.#..",
  "...####...",
];

const NODES = [
  { icon: LAPTOP, title: "This device", sub: "Your library in OPFS" },
  { icon: CLOUD, title: "Your private cloud", sub: "Any WebDAV server" },
  { icon: PHONE, title: "Another device", sub: "The same library" },
];

const POINTS: Array<[string, string]> = [
  [
    "Use WebDAV",
    "Memora library is already real files and folders in the browser's private file system (OPFS). That makes it a good fit for WebDAV, a long-standing standard for syncing files.",
  ],
  [
    "You own your data",
    "Sync can go to a server you choose: your NAS, a Nextcloud instance, or a provider you already use.",
  ],
];

export function Sync(): ReactElement {
  usePageMeta({
    title: "Sync · Memora",
    description:
      "Sync is in progress: your Memora library, mirrored over WebDAV to storage you own and on to your other devices.",
    path: "/sync",
  });
  return (
    <section className="page-head sync-page">
      <div className="wrap">
        <span className="sync-chip">In progress</span>
        <h1 className="page-title">
          Sync to the <em>Cloud.</em>
        </h1>
        <p className="lede">Still working on it, feel free to share your thought</p>

        <div
          className="sync-diagram"
          aria-label="This device syncs to your private cloud over WebDAV, which syncs to another device"
          role="img"
        >
          {NODES.map((n, i) => (
            <div key={n.title} className="sync-step">
              <div className="sync-node">
                <Matrix cols={10} rows={8} cell={art(n.icon)} className="sync-mx" />
                <b>{n.title}</b>
                <small>{n.sub}</small>
              </div>
              {i < NODES.length - 1 && (
                <div className={`sync-link${i === 1 ? " rev" : ""}`} aria-hidden="true">
                  <i />
                  <i />
                  <span>WebDAV</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="points">
          {POINTS.map(([title, text]) => (
            <div key={title} className="point">
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="actions">
          <a
            className="btn btn-primary"
            href="https://github.com/MaxtuneLee/memora/issues"
            target="_blank"
            rel="noopener"
          >
            Tell me what you think
          </a>
        </div>
      </div>
    </section>
  );
}
