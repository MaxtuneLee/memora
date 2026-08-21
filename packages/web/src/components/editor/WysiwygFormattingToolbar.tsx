import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CodeIcon,
  LinkSimpleIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  type Icon,
} from "@phosphor-icons/react";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createRangeSelectionFromDom,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type RangeSelection,
  type TextFormatType,
  type TextNode,
} from "lexical";

type PressedState = boolean | "mixed";
type ToolbarFormat = Extract<TextFormatType, "bold" | "code" | "italic" | "strikethrough">;

interface ToolbarPosition {
  left: number;
  top: number;
}

interface ToolbarSnapshot {
  bold: PressedState;
  code: PressedState;
  italic: PressedState;
  link: PressedState;
  position: ToolbarPosition;
  strikethrough: PressedState;
  visible: boolean;
}

interface FormatControl {
  format: ToolbarFormat;
  icon: Icon;
  label: string;
  state: keyof Pick<ToolbarSnapshot, "bold" | "code" | "italic" | "strikethrough">;
}

const FORMAT_CONTROLS: ReadonlyArray<FormatControl> = [
  { format: "bold", icon: TextBIcon, label: "Bold", state: "bold" },
  { format: "italic", icon: TextItalicIcon, label: "Italic", state: "italic" },
  {
    format: "strikethrough",
    icon: TextStrikethroughIcon,
    label: "Strikethrough",
    state: "strikethrough",
  },
  { format: "code", icon: CodeIcon, label: "Inline code", state: "code" },
];

const EMPTY_POSITION = { left: 8, top: 8 } as const;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_MARGIN = 8;
const TOOLBAR_WIDTH = 220;

const INITIAL_SNAPSHOT: ToolbarSnapshot = {
  bold: false,
  code: false,
  italic: false,
  link: false,
  position: EMPTY_POSITION,
  strikethrough: false,
  visible: false,
};

const getSelectedTextNodes = (selection: RangeSelection): TextNode[] => {
  const startPoint = selection.isBackward() ? selection.focus : selection.anchor;
  const endPoint = selection.isBackward() ? selection.anchor : selection.focus;
  const startNode = startPoint.getNode();
  const endNode = endPoint.getNode();

  return selection.getNodes().filter((node): node is TextNode => {
    if (!$isTextNode(node) || node.getTextContentSize() === 0) {
      return false;
    }

    if (node.is(startNode) && startPoint.type === "text") {
      const selectedEnd =
        node.is(endNode) && endPoint.type === "text" ? endPoint.offset : node.getTextContentSize();
      if (startPoint.offset >= selectedEnd) {
        return false;
      }
    }

    if (node.is(endNode) && endPoint.type === "text" && endPoint.offset === 0) {
      return false;
    }

    return true;
  });
};

const getPressedState = (nodes: TextNode[], format: ToolbarFormat): PressedState => {
  const formattedCount = nodes.filter((node) => node.hasFormat(format)).length;
  if (formattedCount === 0) {
    return false;
  }
  if (formattedCount === nodes.length) {
    return true;
  }
  return "mixed";
};

const getLinkKey = (node: TextNode): string | null => {
  let parent = node.getParent();
  while (parent) {
    if ($isLinkNode(parent)) {
      return parent.getKey();
    }
    parent = parent.getParent();
  }
  return null;
};

const getLinkPressedState = (nodes: TextNode[]): PressedState => {
  const linkKeys = nodes.map(getLinkKey);
  if (linkKeys.every((key) => key === null)) {
    return false;
  }

  const firstLinkKey = linkKeys[0];
  if (firstLinkKey && linkKeys.every((key) => key === firstLinkKey)) {
    return true;
  }

  return "mixed";
};

const getToolbarPosition = (storedRange: Range | null = null): ToolbarPosition => {
  const domSelection = storedRange ? null : window.getSelection();
  let rect: DOMRect | null = null;
  if (storedRange || domSelection?.rangeCount) {
    try {
      const range = storedRange ?? domSelection?.getRangeAt(0);
      if (typeof range?.getBoundingClientRect === "function") {
        const candidate = range.getBoundingClientRect();
        if (
          Number.isFinite(candidate.left) &&
          Number.isFinite(candidate.top) &&
          Number.isFinite(candidate.right) &&
          Number.isFinite(candidate.bottom)
        ) {
          rect = candidate;
        }
      }
    } catch {
      rect = null;
    }
  }

  const viewportWidth = Math.max(window.innerWidth || 0, TOOLBAR_WIDTH + TOOLBAR_MARGIN * 2);
  const viewportHeight = Math.max(window.innerHeight || 0, TOOLBAR_HEIGHT + TOOLBAR_MARGIN * 2);
  if (!rect) {
    return {
      left: Math.max(TOOLBAR_MARGIN, (viewportWidth - TOOLBAR_WIDTH) / 2),
      top: TOOLBAR_MARGIN,
    };
  }

  const centeredLeft = rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2;
  const preferredTop = rect.top - TOOLBAR_HEIGHT - TOOLBAR_MARGIN;
  const top = preferredTop >= TOOLBAR_MARGIN ? preferredTop : rect.bottom + TOOLBAR_MARGIN;

  return {
    left: Math.min(
      Math.max(centeredLeft, TOOLBAR_MARGIN),
      viewportWidth - TOOLBAR_WIDTH - TOOLBAR_MARGIN,
    ),
    top: Math.min(Math.max(top, TOOLBAR_MARGIN), viewportHeight - TOOLBAR_HEIGHT - TOOLBAR_MARGIN),
  };
};

export const isSafeFormattingLinkUrl = (value: string): boolean => {
  const url = value.trim();
  const hasCharacterReference = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/iu.test(url);
  if (
    !url ||
    /[\p{Cc}\s]/u.test(url) ||
    url.includes("\\") ||
    hasCharacterReference ||
    url.startsWith("//")
  ) {
    return false;
  }

  if (url.startsWith("#") || url.startsWith("/")) {
    return true;
  }

  const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):/iu);
  if (!schemeMatch) {
    return true;
  }

  const scheme = schemeMatch[1]?.toLowerCase();
  if (scheme === "mailto") {
    return url.length > "mailto:".length;
  }
  if (scheme !== "http" && scheme !== "https") {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === `${scheme}:` && parsed.hostname.length > 0;
  } catch {
    return false;
  }
};

const buttonClassName =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-memora-text-muted)] outline-none transition-colors hover:bg-[var(--color-memora-hover)] hover:text-[var(--color-memora-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)] aria-pressed:bg-[var(--color-memora-surface-muted)] aria-pressed:text-[var(--color-memora-text-strong)]";

export function WysiwygFormattingToolbar() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastDomRangeRef = useRef<Range | null>(null);
  const lastSelectionRef = useRef<RangeSelection | null>(null);
  const firstSelectedFormatsRef = useRef<Record<ToolbarFormat, boolean>>({
    bold: false,
    code: false,
    italic: false,
    strikethrough: false,
  });
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);

  const clearStoredSelection = useCallback((): void => {
    lastSelectionRef.current = null;
    lastDomRangeRef.current = null;
    firstSelectedFormatsRef.current = {
      bold: false,
      code: false,
      italic: false,
      strikethrough: false,
    };
  }, []);

  const isInsideInteractionRegion = useCallback((): boolean => {
    const activeElement = document.activeElement;
    const root = editor.getRootElement();
    return Boolean(
      activeElement &&
      ((root && (activeElement === root || root.contains(activeElement))) ||
        toolbarRef.current?.contains(activeElement)),
    );
  }, [editor]);

  const readSelection = useCallback((): void => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      clearStoredSelection();
      if (!toolbarRef.current?.contains(document.activeElement)) {
        setSnapshot((current) => ({ ...current, visible: false }));
      }
      return;
    }

    if (selection.isCollapsed()) {
      clearStoredSelection();
      setSnapshot((current) => ({ ...current, visible: false }));
      return;
    }

    const nodes = getSelectedTextNodes(selection);
    if (nodes.length === 0) {
      clearStoredSelection();
      setSnapshot((current) => ({ ...current, visible: false }));
      return;
    }

    lastSelectionRef.current = selection.clone();
    const domSelection = window.getSelection();
    if (domSelection?.rangeCount) {
      try {
        lastDomRangeRef.current = domSelection.getRangeAt(0).cloneRange();
      } catch {
        lastDomRangeRef.current = null;
      }
    }
    firstSelectedFormatsRef.current = {
      bold: nodes[0]?.hasFormat("bold") ?? false,
      code: nodes[0]?.hasFormat("code") ?? false,
      italic: nodes[0]?.hasFormat("italic") ?? false,
      strikethrough: nodes[0]?.hasFormat("strikethrough") ?? false,
    };
    setSnapshot({
      bold: getPressedState(nodes, "bold"),
      code: getPressedState(nodes, "code"),
      italic: getPressedState(nodes, "italic"),
      link: getLinkPressedState(nodes),
      position: getToolbarPosition(lastDomRangeRef.current),
      strikethrough: getPressedState(nodes, "strikethrough"),
      visible: isInsideInteractionRegion(),
    });
  }, [clearStoredSelection, isInsideInteractionRegion]);

  useEffect(() => {
    const unregisterUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(readSelection);
    });
    const unregisterSelectionCommand = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        readSelection();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const handleFocusIn = (): void => {
      if (!isInsideInteractionRegion() || !lastSelectionRef.current) {
        return;
      }
      setSnapshot((current) => ({ ...current, visible: true }));
    };
    const handleFocusOut = (): void => {
      requestAnimationFrame(() => {
        if (!isInsideInteractionRegion()) {
          setSnapshot((current) => ({ ...current, visible: false }));
        }
      });
    };
    const handleDomSelectionChange = (): void => {
      const root = editor.getRootElement();
      const domSelection = window.getSelection();
      if (
        !root ||
        !domSelection?.anchorNode ||
        !domSelection.focusNode ||
        !root.contains(domSelection.anchorNode) ||
        !root.contains(domSelection.focusNode)
      ) {
        return;
      }

      editor.update(
        () => {
          $setSelection($createRangeSelectionFromDom(domSelection, editor));
          readSelection();
        },
        { discrete: true },
      );
    };
    const updateToolbarPosition = (): void => {
      const domRange = lastDomRangeRef.current;
      if (!domRange) {
        return;
      }

      const position = getToolbarPosition(domRange);
      setSnapshot((current) => (current.visible ? { ...current, position } : current));
    };
    const visualViewport = window.visualViewport;
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("selectionchange", handleDomSelectionChange);
    window.addEventListener("scroll", updateToolbarPosition, true);
    window.addEventListener("resize", updateToolbarPosition);
    visualViewport?.addEventListener("scroll", updateToolbarPosition);
    visualViewport?.addEventListener("resize", updateToolbarPosition);

    return () => {
      unregisterUpdateListener();
      unregisterSelectionCommand();
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("selectionchange", handleDomSelectionChange);
      window.removeEventListener("scroll", updateToolbarPosition, true);
      window.removeEventListener("resize", updateToolbarPosition);
      visualViewport?.removeEventListener("scroll", updateToolbarPosition);
      visualViewport?.removeEventListener("resize", updateToolbarPosition);
    };
  }, [editor, isInsideInteractionRegion, readSelection]);

  const restoreSelection = useCallback((): boolean => {
    const storedSelection = lastSelectionRef.current;
    if (!storedSelection) {
      return false;
    }

    editor.update(
      () => {
        $setSelection(storedSelection.clone());
      },
      { discrete: true },
    );
    return true;
  }, [editor]);

  const handleFormat = useCallback(
    (format: ToolbarFormat, pressed: PressedState): void => {
      const storedSelection = lastSelectionRef.current;
      if (!storedSelection) {
        return;
      }

      editor.update(
        () => {
          $setSelection(storedSelection.clone());
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
          if (pressed === "mixed" && firstSelectedFormatsRef.current[format]) {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
          }
        },
        { discrete: true },
      );
    },
    [editor],
  );

  const moveToolbarFocus = useCallback((key: string, target: EventTarget | null): boolean => {
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return false;
    }

    const controls = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const currentIndex = controls.indexOf(target as HTMLButtonElement);
    if (currentIndex === -1 || controls.length === 0) {
      return false;
    }

    let nextIndex = currentIndex;
    if (key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + controls.length) % controls.length;
    } else if (key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % controls.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else {
      nextIndex = controls.length - 1;
    }

    controls[nextIndex]?.focus();
    return true;
  }, []);

  const handleLink = useCallback((): void => {
    if (!restoreSelection()) {
      return;
    }

    if (snapshot.link === true) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }

    const destination = window.prompt("Link destination");
    if (destination === null) {
      restoreSelection();
      return;
    }

    const url = destination.trim();
    if (!isSafeFormattingLinkUrl(url)) {
      restoreSelection();
      return;
    }

    restoreSelection();
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  }, [editor, restoreSelection, snapshot.link]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
  };

  const handleEscape = useCallback((): void => {
    if (!restoreSelection()) {
      return;
    }

    const root = editor.getRootElement();
    root?.focus({ preventScroll: true });
    const domRange = lastDomRangeRef.current;
    if (
      root &&
      domRange &&
      root.contains(domRange.startContainer) &&
      root.contains(domRange.endContainer)
    ) {
      const domSelection = window.getSelection();
      domSelection?.removeAllRanges();
      domSelection?.addRange(domRange.cloneRange());
    }
  }, [editor, restoreSelection]);

  if (!snapshot.visible) {
    return null;
  }

  return (
    <div
      aria-label="Text formatting"
      className="fixed z-30 flex items-center gap-0.5 rounded-xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] p-1 shadow-[0_12px_34px_-22px_rgba(34,33,29,0.38)]"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          handleEscape();
          return;
        }
        if (moveToolbarFocus(event.key, event.target)) {
          event.preventDefault();
        }
      }}
      ref={toolbarRef}
      role="toolbar"
      aria-orientation="horizontal"
      style={{ left: snapshot.position.left, top: snapshot.position.top }}
    >
      {FORMAT_CONTROLS.map(({ format, icon: IconComponent, label, state }) => (
        <button
          aria-label={label}
          aria-pressed={snapshot[state]}
          className={buttonClassName}
          key={format}
          onClick={() => {
            handleFormat(format, snapshot[state]);
          }}
          onPointerDown={handlePointerDown}
          title={label}
          type="button"
        >
          <IconComponent aria-hidden="true" size={17} weight="bold" />
        </button>
      ))}
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--color-memora-border)]" />
      <button
        aria-label="Link"
        aria-pressed={snapshot.link}
        className={buttonClassName}
        onClick={handleLink}
        onPointerDown={handlePointerDown}
        title="Link"
        type="button"
      >
        <LinkSimpleIcon aria-hidden="true" size={17} weight="bold" />
      </button>
    </div>
  );
}
