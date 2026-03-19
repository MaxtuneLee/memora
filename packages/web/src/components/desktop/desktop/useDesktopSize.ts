import { useEffect, useState } from "react";
import type { RefObject } from "react";

export const useDesktopSize = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [desktopSize, setDesktopSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    setDesktopSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setDesktopSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return desktopSize;
};
