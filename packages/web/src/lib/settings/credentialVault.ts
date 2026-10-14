import { useSyncExternalStore } from "react";

// Encrypts provider API keys before they reach LiveStore, whose state and event log live in
// OPFS and can be read straight from disk. Format and threat model: docs/credential-vault.md.
//
// A sealed key is a self-describing string stored where the plaintext key used to be:
//   mv1.<credentialId>.<salt>.<iv>.<ciphertext>  passkey (WebAuthn PRF) protected
//   md1.<iv>.<ciphertext>                        device key kept in IndexedDB
// All parts are base64url. Decrypted keys are kept only in memory for this page load.

export interface StoredCredential {
  providerId: string;
  apiKey: string;
}

export interface SealedCredential {
  providerId: string;
  apiKey: string;
}

/** Which key protects API keys. Not secret; read synchronously before the app starts. */
export type VaultConfig =
  | { mode: "device" }
  | { mode: "passkey"; credentialId: string; salt: string };

export class CredentialVaultError extends Error {}

const PASSKEY_PREFIX = "mv1.";
const DEVICE_PREFIX = "md1.";
const HKDF_INFO = new TextEncoder().encode("memora provider api keys v1");
const CONFIG_STORAGE_KEY = "memora.credentialVault.v1";
const DEVICE_DB_NAME = "memora-credential-vault";
const DEVICE_KEY_ID = "device-key";

interface PasskeyKey {
  credentialId: string;
  salt: string;
  key: CryptoKey;
}

let passkeyKey: PasskeyKey | null = null;
let deviceKeyPromise: Promise<CryptoKey> | null = null;
const plaintextBySealed = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();

const notify = (): void => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Re-renders the caller when keys are unlocked, locked, or the mode changes. */
export const useCredentialVaultVersion = (): number =>
  useSyncExternalStore(subscribe, () => version);

export const readVaultConfig = (): VaultConfig => {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) ?? "null") as unknown;
    if (
      value &&
      typeof value === "object" &&
      (value as VaultConfig).mode === "passkey" &&
      typeof (value as { credentialId?: unknown }).credentialId === "string" &&
      typeof (value as { salt?: unknown }).salt === "string"
    ) {
      return value as VaultConfig;
    }
  } catch {
    // Unreadable config falls back to the device key; passkey-sealed rows then ask to unlock.
  }
  return { mode: "device" };
};

const writeVaultConfig = (config: VaultConfig): void => {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  notify();
};

export const isPasskeyUnlocked = (): boolean => passkeyKey !== null;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );

const randomBytes = (length: number): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(length));

export const isSealedApiKey = (value: string): boolean =>
  value.startsWith(PASSKEY_PREFIX) || value.startsWith(DEVICE_PREFIX);

/** The usable key for a stored value: plaintext as-is, a sealed key once unlocked, else "". */
export const peekApiKey = (stored: string): string =>
  isSealedApiKey(stored) ? (plaintextBySealed.get(stored) ?? "") : stored;

export interface CredentialVaultState {
  /** Sealed keys this page has not decrypted yet. */
  locked: boolean;
  /** Keys still stored as plaintext. */
  plaintext: boolean;
}

export const readCredentialVaultState = (
  credentials: readonly StoredCredential[],
): CredentialVaultState => ({
  locked: credentials.some(
    (row) => isSealedApiKey(row.apiKey) && !plaintextBySealed.has(row.apiKey),
  ),
  plaintext: credentials.some((row) => row.apiKey !== "" && !isSealedApiKey(row.apiKey)),
});

const encrypt = async (key: CryptoKey, plaintext: string): Promise<string> => {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
};

const decrypt = async (key: CryptoKey, iv: string, ciphertext: string): Promise<string> => {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
};

const deriveKey = async (secret: BufferSource): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

// The browser reports a cancelled prompt, a timeout, and a missing passkey the same way.
const callWebAuthn = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new CredentialVaultError(
        "The passkey request was cancelled or timed out. Try again, and choose the passkey you set up for Memora.",
      );
    }
    throw error;
  }
};

const evaluatePrf = async (credentialId: string, salt: string): Promise<BufferSource> => {
  const assertion = (await callWebAuthn(() =>
    navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
        userVerification: "required",
        extensions: { prf: { eval: { first: fromBase64Url(salt) } } },
      },
    }),
  )) as PublicKeyCredential | null;
  const secret = assertion?.getClientExtensionResults().prf?.results?.first;
  if (!secret) {
    throw new CredentialVaultError("This passkey cannot unlock Memora in this browser.");
  }
  return secret;
};

const createPasskeyKey = async (): Promise<PasskeyKey> => {
  if (typeof PublicKeyCredential === "undefined") {
    throw new CredentialVaultError("This browser does not support passkeys.");
  }
  const salt = toBase64Url(randomBytes(32));
  const credential = (await callWebAuthn(() =>
    navigator.credentials.create({
      publicKey: {
        rp: { name: "Memora" },
        user: { id: randomBytes(16), name: "Memora", displayName: "Memora" },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        extensions: { prf: { eval: { first: fromBase64Url(salt) } } },
      },
    }),
  )) as PublicKeyCredential | null;
  if (!credential) throw new CredentialVaultError("Passkey setup was cancelled.");

  const prf = credential.getClientExtensionResults().prf;
  if (!prf?.enabled) {
    throw new CredentialVaultError(
      "This passkey can't encrypt data. Try a different passkey provider or browser.",
    );
  }
  const credentialId = toBase64Url(new Uint8Array(credential.rawId));
  // Some authenticators only evaluate PRF on sign-in, which asks the user a second time.
  const secret = prf.results?.first ?? (await evaluatePrf(credentialId, salt));
  return { credentialId, salt, key: await deriveKey(secret) };
};

const requestStore = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDeviceDb = async (): Promise<IDBDatabase> => {
  const open = indexedDB.open(DEVICE_DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore("keys");
  return requestStore(open);
};

// A non-extractable key in IndexedDB keeps keys out of OPFS, but anyone with the browser profile
// on disk can still use it. The passkey mode removes it.
const getDeviceKey = (): Promise<CryptoKey> => {
  deviceKeyPromise ??= (async () => {
    const db = await openDeviceDb();
    const existing = (await requestStore(
      db.transaction("keys").objectStore("keys").get(DEVICE_KEY_ID),
    )) as CryptoKey | undefined;
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await requestStore(
      db.transaction("keys", "readwrite").objectStore("keys").put(key, DEVICE_KEY_ID),
    );
    return key;
  })();
  deviceKeyPromise.catch(() => {
    deviceKeyPromise = null;
  });
  return deviceKeyPromise;
};

const deleteDeviceKey = async (): Promise<void> => {
  deviceKeyPromise = null;
  const db = await openDeviceDb();
  await requestStore(db.transaction("keys", "readwrite").objectStore("keys").delete(DEVICE_KEY_ID));
};

const findPasskeyEnvelope = (
  credentials: readonly StoredCredential[],
): { credentialId: string; salt: string } | null => {
  const sealed = credentials.find((row) => row.apiKey.startsWith(PASSKEY_PREFIX));
  if (!sealed) return null;
  const [, credentialId, salt] = sealed.apiKey.split(".");
  return credentialId && salt ? { credentialId, salt } : null;
};

/** Decrypts every sealed key the current keys can open. Device-sealed keys need no prompt. */
export const decryptCredentials = async (
  credentials: readonly StoredCredential[],
): Promise<void> => {
  let changed = false;
  for (const { apiKey } of credentials) {
    if (plaintextBySealed.has(apiKey)) continue;
    const parts = apiKey.split(".");
    try {
      if (apiKey.startsWith(DEVICE_PREFIX) && parts.length === 3) {
        plaintextBySealed.set(apiKey, await decrypt(await getDeviceKey(), parts[1], parts[2]));
        changed = true;
      } else if (
        apiKey.startsWith(PASSKEY_PREFIX) &&
        parts.length === 5 &&
        passkeyKey?.credentialId === parts[1] &&
        passkeyKey.salt === parts[2]
      ) {
        plaintextBySealed.set(apiKey, await decrypt(passkeyKey.key, parts[3], parts[4]));
        changed = true;
      }
    } catch {
      // ponytail: an undecryptable key stays locked; the user re-enters it in Settings.
    }
  }
  if (changed) notify();
};

/**
 * Asks for the passkey. Uses the configured one, or the one that sealed these rows when the
 * config is missing, and records it so the next start shows the lock screen.
 */
export const unlockWithPasskey = async (
  credentials: readonly StoredCredential[] = [],
): Promise<void> => {
  const config = readVaultConfig();
  const target = config.mode === "passkey" ? config : findPasskeyEnvelope(credentials);
  if (!target) throw new CredentialVaultError("No passkey is set up for Memora.");
  if (passkeyKey?.credentialId !== target.credentialId) {
    const key = await deriveKey(await evaluatePrf(target.credentialId, target.salt));
    passkeyKey = { ...target, key };
  }
  if (config.mode !== "passkey") writeVaultConfig({ mode: "passkey", ...target });
  await decryptCredentials(credentials);
  if (readCredentialVaultState(credentials).locked) {
    throw new CredentialVaultError("This passkey does not match the one that encrypted your keys.");
  }
  notify();
};

/** Encrypts an API key with the configured protection. */
export const sealApiKey = async (apiKey: string): Promise<string> => {
  if (!apiKey) return "";
  const config = readVaultConfig();
  if (config.mode === "passkey" && !passkeyKey) await unlockWithPasskey();
  const sealed =
    config.mode === "passkey" && passkeyKey
      ? `${PASSKEY_PREFIX}${passkeyKey.credentialId}.${passkeyKey.salt}.${await encrypt(passkeyKey.key, apiKey)}`
      : `${DEVICE_PREFIX}${await encrypt(await getDeviceKey(), apiKey)}`;
  plaintextBySealed.set(sealed, apiKey);
  notify();
  return sealed;
};

const resealAll = async (credentials: readonly StoredCredential[]): Promise<SealedCredential[]> => {
  const resealed: SealedCredential[] = [];
  for (const row of credentials) {
    const plaintext = peekApiKey(row.apiKey);
    // Keys this page cannot read stay as they are.
    if (!plaintext) continue;
    resealed.push({ providerId: row.providerId, apiKey: await sealApiKey(plaintext) });
  }
  return resealed;
};

/**
 * Creates a passkey, re-encrypts every readable key with it, and deletes the device key so copies
 * sealed with it in LiveStore history can no longer be decrypted. Commit the returned rows.
 */
export const enablePasskey = async (
  credentials: readonly StoredCredential[],
): Promise<SealedCredential[]> => {
  await decryptCredentials(credentials);
  if (readCredentialVaultState(credentials).locked) {
    throw new CredentialVaultError("Unlock your API keys before turning on the passkey.");
  }
  passkeyKey = await createPasskeyKey();
  writeVaultConfig({
    mode: "passkey",
    credentialId: passkeyKey.credentialId,
    salt: passkeyKey.salt,
  });
  const resealed = await resealAll(credentials);
  await deleteDeviceKey();
  return resealed;
};

/** Re-encrypts every readable key with the device key. Commit the returned rows. */
export const disablePasskey = async (
  credentials: readonly StoredCredential[],
): Promise<SealedCredential[]> => {
  if (readVaultConfig().mode === "passkey" && !passkeyKey) await unlockWithPasskey(credentials);
  writeVaultConfig({ mode: "device" });
  const resealed = await resealAll(credentials);
  passkeyKey = null;
  notify();
  return resealed;
};

/** For a lost passkey: stops asking for it. Keys it sealed stay unreadable and must be re-entered. */
export const forgetPasskey = (): void => {
  passkeyKey = null;
  writeVaultConfig({ mode: "device" });
};

/** Forgets decrypted keys and the passkey-derived key. */
export const lockCredentials = (): void => {
  passkeyKey = null;
  plaintextBySealed.clear();
  notify();
};
