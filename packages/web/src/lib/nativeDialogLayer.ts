import { useSyncExternalStore } from "react";

const dialogs: { element: HTMLDialogElement }[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => dialogs.at(-1)?.element;
const getServerSnapshot = () => undefined;

/** Keep global overlays inside the most recently opened native modal. */
export const registerNativeDialogLayer = (element: HTMLDialogElement): (() => void) => {
  const entry = { element };
  dialogs.push(entry);
  notify();
  return () => {
    const index = dialogs.indexOf(entry);
    if (index === -1) return;
    dialogs.splice(index, 1);
    notify();
  };
};

export const useNativeDialogLayer = (): HTMLDialogElement | undefined =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
