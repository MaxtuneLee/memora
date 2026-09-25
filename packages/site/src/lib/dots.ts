// The Memora cat and wordmark, sampled onto dot grids. Paths come from the logo SVGs in
// packages/web/public.
export const CAT_BODY =
  "M202.961 545.633C246.634 465.642 338.26 116.355 338.26 116.355C338.26 116.355 539.497 292.963 616.79 400.079C658.721 274.469 798.259 45.0035 798.259 45.0035C798.259 45.0035 950.968 333.439 1012.28 420.098C1073.6 506.757 1239.94 619.577 1193.65 819.551C1147.36 1019.52 964.797 1118.66 707.375 1158.59C488.112 1192.6 215.466 1088.11 135.088 944.055C53.2499 797.378 159.287 625.624 202.961 545.633Z";
const CAT_EYE_1 =
  "M517.585 605.552C565.235 600.283 616.308 682.433 631.66 789.04C647.012 895.647 620.829 986.341 573.179 991.611C525.529 996.881 474.457 914.731 459.105 808.124C443.753 701.517 469.936 610.822 517.585 605.552Z";
const CAT_EYE_2 =
  "M819.334 564.467C869.461 557.964 924.867 639.001 943.087 745.468C961.306 851.935 935.44 943.515 885.312 950.019C835.184 956.522 779.778 875.484 761.558 769.017C743.339 662.55 769.206 570.97 819.334 564.467Z";
const WORDMARK_ME =
  "M0 80V0H16V16H32V32H48V48H32V32H16V80H0ZM64 80V32H48V16H64V0H80V80H64ZM112 80V0H160V16H128V32H160V48H128V64H160V80H112Z";
const WORDMARK_MORA =
  "M192 80V0H208V16H224V32H240V48H224V32H208V80H192ZM256 80V32H240V16H256V0H272V80H256ZM320 80V64H304V16H320V0H352V16H368V64H352V80H320ZM320 63.36H352V16.64H320V63.36ZM400 80V0H448V16H464V32H448V64H464V80H448V64H432V48H416V80H400ZM416 32H447.36V16H416V32ZM496 80V16H512V0H544V16H560V80H544V48H512V80H496ZM512 32H544V16.64H512V32Z";
export const WORDMARK_PATHS = [WORDMARK_ME, WORDMARK_MORA] as const;

export type CatCell = "body" | "bg";

export interface CatSample {
  cells: CatCell[];
  eyes: Set<number>;
}

let ctx: CanvasRenderingContext2D | null = null;
const context = (): CanvasRenderingContext2D => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  return ctx;
};

export function sampleCat(n: number): CatSample {
  const g = context();
  const body = new Path2D(CAT_BODY),
    e1 = new Path2D(CAT_EYE_1),
    e2 = new Path2D(CAT_EYE_2);
  const cells: CatCell[] = [];
  const eyes = new Set<number>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = ((c + 0.5) * 1255) / n,
        y = ((r + 0.5) * 1243) / n;
      const inBody = g.isPointInPath(body, x, y);
      cells.push(inBody ? "body" : "bg");
      if (inBody && (g.isPointInPath(e1, x, y) || g.isPointInPath(e2, x, y))) eyes.add(r * n + c);
    }
  }
  return { cells, eyes };
}

export type WordmarkCell = "a" | "b" | "off";

// The pixel wordmark is drawn on a 16-unit grid: 35 columns by 5 rows.
export function sampleWordmark(): WordmarkCell[] {
  const g = context();
  const [me, mora] = WORDMARK_PATHS.map((d) => new Path2D(d));
  const out: WordmarkCell[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 35; c++) {
      const x = c * 16 + 8,
        y = r * 16 + 8;
      out.push(g.isPointInPath(me, x, y) ? "a" : g.isPointInPath(mora, x, y) ? "b" : "off");
    }
  }
  return out;
}

export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
