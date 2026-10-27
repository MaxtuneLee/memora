// A widget's frame starts at one pixel tall and grows once the runner measures its content, which
// pushes everything below it down. Remembering the last measured height lets the next load reserve
// that space from the first paint.

const STORAGE_KEY = "memora:widget-heights";
const MAX_ENTRIES = 100;

type HeightMap = Record<string, number>;

const readMap = (): HeightMap => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as HeightMap) : {};
  } catch {
    return {};
  }
};

export const readCachedHeight = (key: string | undefined): number | null => {
  const height = key ? readMap()[key] : undefined;
  return typeof height === "number" && Number.isFinite(height) && height > 1 ? height : null;
};

export const writeCachedHeight = (key: string | undefined, height: number): void => {
  if (!key || !Number.isFinite(height) || height <= 1) {
    return;
  }
  try {
    const map = readMap();
    // Re-inserting moves the key to the end, so the oldest entries are the ones dropped.
    delete map[key];
    map[key] = Math.round(height);
    const keys = Object.keys(map);
    const kept = keys.slice(Math.max(0, keys.length - MAX_ENTRIES));
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(kept.map((name) => [name, map[name]]))),
    );
  } catch {
    // Storage can be full or blocked; the frame just starts small next time.
  }
};

// A short, stable key for widget code, so a saved widget finds its height again.
export const hashWidgetCode = (code: string): string => {
  let hash = 5381;
  for (let index = 0; index < code.length; index += 1) {
    hash = ((hash << 5) + hash + code.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
};

// Home Grid frames are keyed by the saved code, so a widget saved from Chat can hand over the
// height it just measured there and be laid out right the first time it appears on the grid.
export const homeHeightKey = (widgetCode: string): string => `home:${hashWidgetCode(widgetCode)}`;
