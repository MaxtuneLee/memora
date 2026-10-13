// Streamdown keeps its table fullscreen state inside the component and offers no callback, so
// the open/close actions are caught in the capture phase and replayed inside a view transition.
// The inline table box and the fullscreen table share one view-transition-name to morph.
// ponytail: relies on Streamdown's DOM (fullscreen button = last toolbar button, close button =
// last fullscreen toolbar button); recheck after Streamdown upgrades.

const TRANSITION_NAME = "streamdown-table";
const WRAPPER = '[data-streamdown="table-wrapper"]';
const FULLSCREEN = '[data-streamdown="table-fullscreen"]';

let replaying = false;
let sourceWrapper: HTMLElement | null = null;

const inlineBox = (wrapper: HTMLElement | null): HTMLElement | null =>
  wrapper?.lastElementChild instanceof HTMLElement ? wrapper.lastElementChild : null;

const fullscreenTable = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(`${FULLSCREEN} [data-streamdown="table"]`);

const isLastToolbarButton = (button: HTMLButtonElement, toolbar: Element | null): boolean =>
  toolbar !== null && button.parentElement === toolbar && toolbar.lastElementChild === button;

const canTransition = (): boolean =>
  typeof document.startViewTransition === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const run = (from: HTMLElement | null, to: () => HTMLElement | null, replay: () => void): void => {
  if (from) from.style.viewTransitionName = TRANSITION_NAME;
  let target: HTMLElement | null = null;

  const transition = document.startViewTransition(async () => {
    if (from) from.style.viewTransitionName = "";
    replaying = true;
    try {
      replay();
    } finally {
      replaying = false;
    }
    // React flushes the discrete update in a microtask; wait one task so the new DOM is in place.
    await new Promise((resolve) => setTimeout(resolve));
    target = to();
    if (target) target.style.viewTransitionName = TRANSITION_NAME;
  });

  void transition.finished.finally(() => {
    if (target) target.style.viewTransitionName = "";
  });
};

const onClick = (event: MouseEvent): void => {
  if (replaying || !canTransition() || !(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (!button) return;

  const wrapper = button.closest<HTMLElement>(WRAPPER);
  if (wrapper && !button.disabled && isLastToolbarButton(button, wrapper.firstElementChild)) {
    event.stopPropagation();
    sourceWrapper = wrapper;
    run(inlineBox(wrapper), fullscreenTable, () => button.click());
    return;
  }

  const fullscreen = button.closest(FULLSCREEN);
  if (
    fullscreen &&
    isLastToolbarButton(button, fullscreen.firstElementChild?.firstElementChild ?? null)
  ) {
    event.stopPropagation();
    run(
      fullscreenTable(),
      () => inlineBox(sourceWrapper),
      () => button.click(),
    );
  }
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (replaying || event.key !== "Escape" || !canTransition()) return;
  if (!document.querySelector(FULLSCREEN)) return;
  event.stopPropagation();
  run(
    fullscreenTable(),
    () => inlineBox(sourceWrapper),
    () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
};

export const startStreamdownTableTransitions = (): void => {
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
};
