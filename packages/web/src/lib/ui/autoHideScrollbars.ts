// Scrollbars stay out of the way until their own container scrolls or the pointer rests over
// it, the way macOS overlay scrollbars behave. Both flags go on the container itself rather
// than on <html>, so one pane's scrollbar never lights up every other pane on the screen.

export const SCROLLING_ATTRIBUTE = "data-scrolling";
export const SCROLL_HOVER_ATTRIBUTE = "data-scroll-hover";

/** How long after a container's last scroll event its scrollbar fades out. */
const IDLE_DELAY_MS = 1000;

const OVERFLOW_SCROLLS = new Set(["auto", "scroll", "overlay"]);

const canScroll = (element: Element): boolean => {
  const { overflowX, overflowY } = getComputedStyle(element);
  return (
    (OVERFLOW_SCROLLS.has(overflowY) && element.scrollHeight > element.clientHeight) ||
    (OVERFLOW_SCROLLS.has(overflowX) && element.scrollWidth > element.clientWidth)
  );
};

/**
 * The innermost scroll container under the pointer, or null when there is none.
 *
 * The walk stops at <body> on purpose. The page itself is an ancestor of everything, so
 * including it would mean the document's scrollbar is revealed whenever the pointer is anywhere
 * in the window — which is every moment the mouse is in use, and the auto-hide would never do
 * anything for the most prominent scrollbar on screen. The page's scrollbar stays scroll-driven.
 */
const hoveredScrollContainer = (target: EventTarget | null): Element | null => {
  let element = target instanceof Element ? target : null;
  while (element !== null && element !== document.body && element !== document.documentElement) {
    if (canScroll(element)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
};

/**
 * Reveals a scrollbar while its container scrolls or the pointer is over it, and hides it again
 * once that container stops and the pointer leaves. Returns a teardown function; it clears the
 * flags everywhere it set them so a caller unmounting mid-scroll cannot strand a pane with a
 * visible scrollbar.
 */
export const startAutoHideScrollbars = ({
  idleDelayMs = IDLE_DELAY_MS,
}: { idleDelayMs?: number } = {}): (() => void) => {
  // Each container keeps its own countdown, which is what lets two panes fade independently.
  const timeouts = new Map<Element, number>();
  let hovered: Element | null = null;

  const handleScroll = (event: Event) => {
    // A scrolling document reports the document itself as the target, and an attribute needs an
    // element, so the page's own scrollbar is flagged on <html>.
    const target = event.target;
    const element =
      target instanceof Element
        ? target
        : target instanceof Document
          ? target.documentElement
          : null;
    if (element === null) {
      return;
    }

    element.setAttribute(SCROLLING_ATTRIBUTE, "");
    window.clearTimeout(timeouts.get(element));
    timeouts.set(
      element,
      window.setTimeout(() => {
        timeouts.delete(element);
        element.removeAttribute(SCROLLING_ATTRIBUTE);
      }, idleDelayMs),
    );
  };

  const setHovered = (next: Element | null) => {
    if (next === hovered) {
      return;
    }
    hovered?.removeAttribute(SCROLL_HOVER_ATTRIBUTE);
    next?.setAttribute(SCROLL_HOVER_ATTRIBUTE, "");
    hovered = next;
  };

  // pointerover fires when the pointer crosses into a new element, so this recomputes on the
  // transitions that can change the answer instead of on every pixel of movement.
  const handlePointerOver = (event: Event) => setHovered(hoveredScrollContainer(event.target));
  const handlePointerLeave = () => setHovered(null);

  // Scroll events do not bubble, so the capture phase is what makes one listener cover every
  // scroll container in the app instead of needing one listener per container.
  document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
  document.addEventListener("pointerover", handlePointerOver, { passive: true });
  document.documentElement.addEventListener("pointerleave", handlePointerLeave, { passive: true });

  return () => {
    document.removeEventListener("scroll", handleScroll, { capture: true });
    document.removeEventListener("pointerover", handlePointerOver);
    document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
    for (const [element, timeoutId] of timeouts) {
      window.clearTimeout(timeoutId);
      element.removeAttribute(SCROLLING_ATTRIBUTE);
    }
    timeouts.clear();
    setHovered(null);
  };
};
