import { useDroppable } from "@dnd-kit/core";
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

import { DESKTOP_ROOT_ID } from "./types";

export const DesktopDropZone = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DesktopDropZone(props, outerRef) {
    const { setNodeRef } = useDroppable({ id: DESKTOP_ROOT_ID });
    return (
      <div
        {...props}
        ref={(node) => {
          setNodeRef(node);
          if (typeof outerRef === "function") outerRef(node);
          else if (outerRef) outerRef.current = node;
        }}
      />
    );
  },
);
