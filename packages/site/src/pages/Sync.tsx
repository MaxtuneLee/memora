import type { ReactElement } from "react";
import { Link } from "react-router";

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
  { icon: CLOUD, title: "Your sync server", sub: "A Worker and R2 on your Cloudflare" },
  { icon: PHONE, title: "Another device", sub: "The same library" },
];

const POINTS: Array<[string, string]> = [
  [
    "Still local-first",
    "Every device keeps the whole library in the browser and works offline. Changes go to the server when you're online and reach your other devices from there.",
  ],
  [
    "Your server, your data",
    "The server is a small Cloudflare Worker you deploy to your own account. Changes travel over WebDAV, and file contents go to R2 in parts, so large recordings sync too.",
  ],
  ["Experimental", "It works, but it's new: keep a backup, and only use a server you control."],
];

export function Sync(): ReactElement {
  usePageMeta({
    title: "Sync · Memora",
    description:
      "Experimental: sync your Memora library between devices through a Cloudflare Worker and R2 storage in your own account.",
    path: "/sync",
  });
  return (
    <section className="page-head sync-page">
      <div className="wrap">
        <span className="sync-chip">Experimental</span>
        <h1 className="page-title">
          Sync to the <em>Cloud.</em>
        </h1>
        <p className="lede">
          Keep the same library on your laptop and your other devices, through a sync server you run
          yourself.
        </p>

        <div
          className="sync-diagram"
          aria-label="This device syncs to your sync server over WebDAV, which syncs to another device"
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
          <Link className="btn btn-primary" to="/docs/sync">
            Set it up
          </Link>
          <a
            className="btn btn-soft"
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
