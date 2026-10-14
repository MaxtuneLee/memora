import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  decryptCredentials,
  disablePasskey,
  enablePasskey,
  forgetPasskey,
  isPasskeyUnlocked,
  lockCredentials,
  peekApiKey,
  readCredentialVaultState,
  readVaultConfig,
  sealApiKey,
  unlockWithPasskey,
} from "@/lib/settings/credentialVault";

let prfSecret = new Uint8Array(32).fill(7);
const prfResult = () => ({ prf: { enabled: true, results: { first: prfSecret } } });
const create = vi.fn(async () => ({
  rawId: new Uint8Array([1, 2, 3]).buffer,
  getClientExtensionResults: prfResult,
}));
const get = vi.fn(async () => ({ getClientExtensionResults: prfResult }));

// Just enough IndexedDB for the device key: one store, get/put/delete.
const idbKeys = new Map<string, unknown>();
const request = <T>(run: () => T) => {
  const req: {
    result?: T;
    onsuccess?: () => void;
    onerror?: () => void;
    onupgradeneeded?: () => void;
  } = {};
  queueMicrotask(() => {
    req.result = run();
    req.onsuccess?.();
  });
  return req;
};
const fakeIndexedDb = {
  open: () => {
    const db = {
      createObjectStore: () => undefined,
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => request(() => idbKeys.get(key)),
          put: (value: unknown, key: string) => request(() => idbKeys.set(key, value)),
          delete: (key: string) => request(() => idbKeys.delete(key)),
        }),
      }),
    };
    return request(() => db);
  },
};

const storage = new Map<string, string>();

beforeEach(() => {
  prfSecret = new Uint8Array(32).fill(7);
  idbKeys.clear();
  storage.clear();
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("navigator", { credentials: { create, get } });
  vi.stubGlobal("indexedDB", fakeIndexedDb);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  lockCredentials();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("seals with the device key by default and reads it back without a prompt", async () => {
  const sealed = await sealApiKey("sk-device");
  expect(sealed).toMatch(/^md1\./);
  expect(sealed).not.toContain("sk-device");
  lockCredentials();
  await decryptCredentials([{ providerId: "p", apiKey: sealed }]);
  expect(peekApiKey(sealed)).toBe("sk-device");
  expect(create).not.toHaveBeenCalled();
});

test("turning the passkey on re-encrypts keys, needs the passkey after a restart, and drops the device key", async () => {
  const deviceSealed = await sealApiKey("sk-secret");
  const plaintextRow = { providerId: "old", apiKey: "sk-plain" };
  const resealed = await enablePasskey([{ providerId: "p", apiKey: deviceSealed }, plaintextRow]);

  expect(readVaultConfig().mode).toBe("passkey");
  expect(resealed.map((row) => row.apiKey)).toEqual([
    expect.stringMatching(/^mv1\./),
    expect.stringMatching(/^mv1\./),
  ]);
  expect(idbKeys.size).toBe(0);

  // A restart: nothing decrypted in memory, so the app must ask for the passkey.
  lockCredentials();
  const rows = resealed.map((row) => ({ ...row }));
  expect(isPasskeyUnlocked()).toBe(false);
  expect(readCredentialVaultState(rows).locked).toBe(true);

  prfSecret = new Uint8Array(32).fill(9);
  await expect(unlockWithPasskey(rows)).rejects.toThrow(/does not match/);

  lockCredentials();
  prfSecret = new Uint8Array(32).fill(7);
  await unlockWithPasskey(rows);
  expect(rows.map((row) => peekApiKey(row.apiKey))).toEqual(["sk-secret", "sk-plain"]);
  // The old device-sealed copy can no longer be opened.
  lockCredentials();
  await decryptCredentials([{ providerId: "p", apiKey: deviceSealed }]);
  expect(peekApiKey(deviceSealed)).toBe("");
});

test("turning the passkey off moves keys back to the device key", async () => {
  const [row] = await enablePasskey([{ providerId: "p", apiKey: "sk-secret" }]);
  const [back] = await disablePasskey([row]);
  expect(readVaultConfig().mode).toBe("device");
  expect(back.apiKey).toMatch(/^md1\./);
  expect(peekApiKey(back.apiKey)).toBe("sk-secret");
});

test("a lost passkey stops the lock and leaves its keys unreadable", async () => {
  const [row] = await enablePasskey([{ providerId: "p", apiKey: "sk-secret" }]);
  lockCredentials();
  forgetPasskey();
  expect(readVaultConfig().mode).toBe("device");
  await decryptCredentials([row]);
  expect(peekApiKey(row.apiKey)).toBe("");
});
