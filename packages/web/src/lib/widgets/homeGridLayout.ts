// Home Grid sizing lives here rather than in the components so both the grid (which owns the
// observed container width) and the tile (which owns the resize gesture) agree on the maths, and
// so the snapping rules can be unit tested without mounting a grid.

export const HOME_GRID_GAP_PX = 14;
export const HOME_GRID_MAX_SPAN = 4;

/**
 * Column count for the observed container width. Breakpoints keep each cell near the 280px
 * minimum and cap the grid at four columns, with a single column as the narrow-window fallback.
 */
export const homeGridColumnCount = (containerWidth: number): number => {
  if (!Number.isFinite(containerWidth) || containerWidth < 574) {
    return 1;
  }
  if (containerWidth < 868) {
    return 2;
  }
  if (containerWidth < 1162) {
    return 3;
  }
  return HOME_GRID_MAX_SPAN;
};

/** Square cell edge for a measured container width at the given column count. */
export const homeGridCellSize = (containerWidth: number, columnCount: number): number =>
  Math.max(0, (containerWidth - HOME_GRID_GAP_PX * (columnCount - 1)) / columnCount);

const clampSpan = (value: number, maxSpan: number): number =>
  Math.max(1, Math.min(maxSpan, Math.round(value)));

/**
 * Snapped spans for an in-flight resize gesture. `cellStride` is one cell plus one gap, so
 * rounding the pointer delta by it changes a span exactly when the pointer crosses the
 * neighbouring cell's midpoint.
 *
 * A gesture that never crosses a column boundary returns `storedColumnSpan` untouched, so
 * resizing vertically in a container too narrow to show the stored width does not silently
 * shrink it — only a horizontal crossing rewrites the stored column span.
 */
export const nextWidgetSpans = ({
  storedColumnSpan,
  storedRowSpan,
  visibleColumnSpan,
  maxColumnSpan,
  cellStride,
  deltaX,
  deltaY,
}: {
  storedColumnSpan: number;
  storedRowSpan: number;
  visibleColumnSpan: number;
  maxColumnSpan: number;
  cellStride: number;
  deltaX: number;
  deltaY: number;
}): { columnSpan: number; rowSpan: number } => {
  const stride = cellStride > 0 ? cellStride : 1;
  const columnSteps = Math.round(deltaX / stride);
  const rowSteps = Math.round(deltaY / stride);

  return {
    columnSpan:
      columnSteps === 0
        ? storedColumnSpan
        : clampSpan(visibleColumnSpan + columnSteps, Math.min(maxColumnSpan, HOME_GRID_MAX_SPAN)),
    rowSpan: clampSpan(storedRowSpan + rowSteps, HOME_GRID_MAX_SPAN),
  };
};
