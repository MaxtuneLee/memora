import { useSyncExternalStore } from "react";

import type { AccessDecision, AccessRequest } from "@/lib/chat/permissions";

/**
 * Access requests from callers outside a chat session, such as the browser's agent through
 * WebMCP. They wait here, oldest first, for this tab's dialog.
 */
interface Pending {
  request: AccessRequest;
  resolve: (decision: AccessDecision) => void;
}

let queue: readonly Pending[] = [];
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

export const requestTabAccess = (request: AccessRequest): Promise<AccessDecision> =>
  new Promise((resolve) => {
    queue = [...queue, { request, resolve }];
    emit();
  });

const decideOldest = (decision: AccessDecision): void => {
  const [oldest, ...rest] = queue;
  if (!oldest) return;
  queue = rest;
  emit();
  oldest.resolve(decision);
};

export const useTabAccessRequest = (): {
  request: AccessRequest | null;
  decide: (decision: AccessDecision) => void;
} => {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => queue[0],
  );
  return { request: current?.request ?? null, decide: decideOldest };
};
