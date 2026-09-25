import { flushSync } from "react-dom";

export interface SharedViewTransitionElement {
  element: HTMLElement;
  name: string;
}

export const runHomeGridViewTransition = ({
  update,
  afterUpdate,
  reducedMotion,
  sharedElement,
}: {
  update: () => void;
  afterUpdate?: () => void;
  reducedMotion: boolean;
  sharedElement?: SharedViewTransitionElement;
}): void => {
  if (reducedMotion || typeof document.startViewTransition !== "function") {
    update();
    afterUpdate?.();
    return;
  }

  if (sharedElement) {
    sharedElement.element.style.viewTransitionName = sharedElement.name;
  }

  document.startViewTransition(() => {
    // The old snapshot has been captured when this callback runs. Releasing the name now lets
    // the new HomeGridTile be the only element with this identity in the new snapshot.
    if (sharedElement) {
      sharedElement.element.style.viewTransitionName = "";
    }
    flushSync(update);
    afterUpdate?.();
  });
};
