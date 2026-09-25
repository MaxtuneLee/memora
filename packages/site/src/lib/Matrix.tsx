import type { CSSProperties, ReactElement } from "react";

// A dot-matrix block: the hero cat's pixel language, reused across the page.
export function Matrix({
  cols,
  rows,
  cell,
  className = "",
  style,
}: {
  cols: number;
  rows: number;
  cell?: (c: number, r: number) => string | undefined;
  className?: string;
  style?: CSSProperties;
}): ReactElement {
  const dots: ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      dots.push(<i key={r * cols + c} className={cell?.(c, r) ?? ""} />);
  }
  return (
    <div className={`mx ${className}`} style={{ ...style, ["--cols" as string]: cols }}>
      {dots}
    </div>
  );
}
