import { useSyncExternalStore } from "react";

// Before chat first sends to a cloud API, tell people what leaves the device. Shown once per
// API host on this browser, so switching to a new provider shows it again.

export interface ChatDataNoticeRequest {
  providerName: string;
  host: string;
}

const STORAGE_KEY = "memora.chatDataNotice.v1";

let pending: (ChatDataNoticeRequest & { resolve: (accepted: boolean) => void }) | null = null;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());

const readAcknowledgedHosts = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export const hostOf = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

/**
 * Resolves once the notice for this host has been acknowledged, showing it first if needed.
 * Throws when it is dismissed, so the message isn't sent.
 */
export const ensureChatDataNoticeAcknowledged = async (
  request: ChatDataNoticeRequest,
): Promise<void> => {
  if (readAcknowledgedHosts().includes(request.host)) return;
  pending?.resolve(false);
  const accepted = await new Promise<boolean>((resolve) => {
    pending = { ...request, resolve };
    notify();
  });
  if (!accepted) throw new Error("Your message wasn't sent.");
};

export const answerChatDataNotice = (accepted: boolean): void => {
  if (!pending) return;
  if (accepted) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...new Set([...readAcknowledgedHosts(), pending.host])]),
      );
    } catch {
      // Without storage the notice shows again next time, which is safe.
    }
  }
  const { resolve } = pending;
  pending = null;
  notify();
  resolve(accepted);
};

export const usePendingChatDataNotice = (): ChatDataNoticeRequest | null =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
