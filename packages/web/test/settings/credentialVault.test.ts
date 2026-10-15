import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  decryptCredentials,
  ensureCredentialsUnlocked,
  forgetPasskey,
  isAppLocked,
  isPasskeyLocked,
  lockCredentials,
  peekApiKey,
  readVaultConfig,
  sealApiKey,
  setAppLock,
  setKeyEncryption,
  unlockApp,
  unlockWithPasskey,
} from "@/lib/settings/credentialVault";

let prfSecret = new Uint8Array(32).fill(7);
let prfSupported = true;
const prfResult = () =>
  prfSupported
    ? { prf: { enabled: true, results: { first: prfSecret } } }
    : { prf: { enabled: false } };
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
  prfSupported = true;
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

const restart = () => lockCredentials();

test("seals with the device key by default and reads it back without a prompt", async () => {
  const sealed = await sealApiKey("sk-device");
  expect(sealed).toMatch(/^md1\./);
  expect(sealed).not.toContain("sk-device");
  restart();
  // Before the device key decrypts it, the key isn't locked behind a passkey either.
  expect(isPasskeyLocked(sealed)).toBe(false);
  await decryptCredentials([{ providerId: "p", apiKey: sealed }]);
  expect(peekApiKey(sealed)).toBe("sk-device");
  expect(create).not.toHaveBeenCalled();
  expect(isAppLocked()).toBe(false);
});

test("passkey encryption without the app lock asks only when a key is needed", async () => {
  const deviceSealed = await sealApiKey("sk-secret");
  const rows = await setKeyEncryption(true, [
    { providerId: "p", apiKey: deviceSealed },
    { providerId: "old", apiKey: "sk-plain" },
  ]);
  expect(readVaultConfig()).toMatchObject({ encryptKeys: true, lockApp: false });
  expect(rows.map((row) => row.apiKey)).toEqual([
    expect.stringMatching(/^mv1\./),
    expect.stringMatching(/^mv1\./),
  ]);
  expect(idbKeys.size).toBe(0);

  restart();
  expect(isAppLocked()).toBe(false);
  await decryptCredentials(rows);
  expect(peekApiKey(rows[0].apiKey)).toBe("");

  prfSecret = new Uint8Array(32).fill(9);
  await expect(ensureCredentialsUnlocked(rows)).rejects.toThrow(/does not match/);
  restart();
  prfSecret = new Uint8Array(32).fill(7);
  await expect(ensureCredentialsUnlocked(rows)).resolves.toBe(true);
  expect(rows.map((row) => peekApiKey(row.apiKey))).toEqual(["sk-secret", "sk-plain"]);
  await expect(ensureCredentialsUnlocked(rows)).resolves.toBe(false);

  // The device-sealed copy left in history can no longer be opened.
  restart();
  await decryptCredentials([{ providerId: "p", apiKey: deviceSealed }]);
  expect(peekApiKey(deviceSealed)).toBe("");
});

test("the app lock alone keeps device-encrypted keys and only verifies the passkey", async () => {
  prfSupported = false;
  await setAppLock(true);
  expect(readVaultConfig()).toMatchObject({ encryptKeys: false, lockApp: true });
  const sealed = await sealApiKey("sk-secret");
  expect(sealed).toMatch(/^md1\./);

  restart();
  expect(isAppLocked()).toBe(true);
  await unlockApp();
  expect(isAppLocked()).toBe(false);
  expect(get).toHaveBeenCalledOnce();

  // That passkey can't encrypt, so turning encryption on asks for a new one, which also can't.
  await expect(setKeyEncryption(true, [{ providerId: "p", apiKey: sealed }])).rejects.toThrow(
    /can't encrypt/,
  );
  expect(readVaultConfig()).toMatchObject({ encryptKeys: false, lockApp: true });
});

test("with both on, one unlock opens the app and decrypts the keys", async () => {
  await setAppLock(true);
  const [row] = await setKeyEncryption(true, [{ providerId: "p", apiKey: "sk-secret" }]);
  expect(create).toHaveBeenCalledOnce();

  restart();
  get.mockClear();
  expect(isAppLocked()).toBe(true);
  await unlockApp();
  expect(isAppLocked()).toBe(false);
  await decryptCredentials([row]);
  expect(peekApiKey(row.apiKey)).toBe("sk-secret");
  await expect(ensureCredentialsUnlocked([row])).resolves.toBe(false);
  expect(get).toHaveBeenCalledOnce();
});

test("turning encryption off moves keys back to the device key and keeps the lock", async () => {
  await setAppLock(true);
  const [row] = await setKeyEncryption(true, [{ providerId: "p", apiKey: "sk-secret" }]);
  const [back] = await setKeyEncryption(false, [row]);
  expect(back.apiKey).toMatch(/^md1\./);
  expect(peekApiKey(back.apiKey)).toBe("sk-secret");
  expect(readVaultConfig()).toMatchObject({ encryptKeys: false, lockApp: true });
  await setAppLock(false);
  expect(readVaultConfig()).toEqual({ passkey: null, encryptKeys: false, lockApp: false });
});

test("the first passkey setting turns into both options", () => {
  storage.set(
    "memora.credentialVault.v1",
    JSON.stringify({ mode: "passkey", credentialId: "AQID", salt: "AAAA" }),
  );
  expect(readVaultConfig()).toEqual({
    passkey: { credentialId: "AQID", salt: "AAAA" },
    encryptKeys: true,
    lockApp: true,
  });
});

test("a lost passkey stops the lock and leaves its keys unreadable", async () => {
  await setAppLock(true);
  const [row] = await setKeyEncryption(true, [{ providerId: "p", apiKey: "sk-secret" }]);
  restart();
  forgetPasskey();
  expect(isAppLocked()).toBe(false);
  await decryptCredentials([row]);
  expect(peekApiKey(row.apiKey)).toBe("");
  // Unlocking from the sealed row itself still works if the passkey turns up again.
  await unlockWithPasskey([row]);
  expect(peekApiKey(row.apiKey)).toBe("sk-secret");
});
