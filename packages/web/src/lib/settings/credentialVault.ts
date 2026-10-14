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

export interface VaultPasskey {
  credentialId: string;
  salt: string;
}

/**
 * Two independent choices that share one passkey. Not secret; kept in localStorage so the lock
 * screen can decide before LiveStore starts.
 */
export interface VaultConfig {
  passkey: VaultPasskey | null;
  /** Seal API keys with the passkey instead of the device key. */
  encryptKeys: boolean;
  /** Ask for the passkey before the workspace loads. */
  lockApp: boolean;
}

export class CredentialVaultError extends Error {}

const PASSKEY_PREFIX = "mv1.";
const DEVICE_PREFIX = "md1.";
const HKDF_INFO = new TextEncoder().encode("memora provider api keys v1");
const CONFIG_STORAGE_KEY = "memora.credentialVault.v2";
const LEGACY_CONFIG_STORAGE_KEY = "memora.credentialVault.v1";
const DEFAULT_CONFIG: VaultConfig = { passkey: null, encryptKeys: false, lockApp: false };
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

const parsePasskey = (value: unknown): VaultPasskey | null => {
  const record = value as Partial<VaultPasskey> | null;
  return record && typeof record.credentialId === "string" && typeof record.salt === "string"
    ? { credentialId: record.credentialId, salt: record.salt }
    : null;
};

export const readVaultConfig = (): VaultConfig => {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) ?? "null") as unknown;
    if (value && typeof value === "object") {
      const record = value as Partial<VaultConfig>;
      const passkey = parsePasskey(record.passkey);
      return {
        passkey,
        encryptKeys: Boolean(passkey && record.encryptKeys),
        lockApp: Boolean(passkey && record.lockApp),
      };
    }
    // The first version had one passkey mode that did both.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CONFIG_STORAGE_KEY) ?? "null") as unknown;
    const legacyPasskey =
      (legacy as { mode?: unknown } | null)?.mode === "passkey" ? parsePasskey(legacy) : null;
    if (legacyPasskey) return { passkey: legacyPasskey, encryptKeys: true, lockApp: true };
  } catch {
    // Unreadable config falls back to the defaults; passkey-sealed rows then ask to unlock.
  }
  return DEFAULT_CONFIG;
};

const writeVaultConfig = (config: VaultConfig): void => {
  const passkey = config.encryptKeys || config.lockApp ? config.passkey : null;
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ ...config, passkey }));
  notify();
};

/** True once the passkey has been used this page load, which also opens the app lock. */
let passkeyVerified = false;

export const isAppLocked = (): boolean => readVaultConfig().lockApp && !passkeyVerified;

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

export const isPasskeySealed = (value: string): boolean => value.startsWith(PASSKEY_PREFIX);

/** Sealed with the passkey and not decrypted yet. Device-sealed keys never need the user. */
export const isPasskeyLocked = (value: string): boolean =>
  isPasskeySealed(value) && !plaintextBySealed.has(value);

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
    throw new CredentialVaultError(PRF_UNSUPPORTED_MESSAGE);
  }
  return secret;
};

interface CreatedPasskey extends VaultPasskey {
  /** Null when the passkey or browser can't evaluate PRF; such a passkey can only lock the app. */
  key: CryptoKey | null;
}

const createPasskey = async (): Promise<CreatedPasskey> => {
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

  const credentialId = toBase64Url(new Uint8Array(credential.rawId));
  const prf = credential.getClientExtensionResults().prf;
  if (!prf?.enabled) return { credentialId, salt, key: null };
  // Some authenticators only evaluate PRF on sign-in, which asks the user a second time.
  const secret = prf.results?.first ?? (await evaluatePrf(credentialId, salt));
  return { credentialId, salt, key: await deriveKey(secret) };
};

/** Asks for the passkey without deriving a key, for the app lock alone. */
const verifyPasskey = async ({ credentialId }: VaultPasskey): Promise<void> => {
  const assertion = await callWebAuthn(() =>
    navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
        userVerification: "required",
      },
    }),
  );
  if (!assertion) throw new CredentialVaultError("The passkey request was cancelled.");
};

const PRF_UNSUPPORTED_MESSAGE =
  "This passkey can't encrypt data. Try a different passkey provider or browser.";

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
// on disk can still use it. Turning on passkey encryption deletes it.
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
 * Derives the passkey key and decrypts passkey-sealed keys. Uses the configured passkey, or the
 * one that sealed these rows when the config is missing, and saves it again.
 */
export const unlockWithPasskey = async (
  credentials: readonly StoredCredential[] = [],
): Promise<void> => {
  const config = readVaultConfig();
  const target = config.passkey ?? findPasskeyEnvelope(credentials);
  if (!target) throw new CredentialVaultError("No passkey is set up for Memora.");
  if (passkeyKey?.credentialId !== target.credentialId) {
    const key = await deriveKey(await evaluatePrf(target.credentialId, target.salt));
    passkeyKey = { ...target, key };
  }
  passkeyVerified = true;
  if (!config.passkey) writeVaultConfig({ ...config, passkey: target, encryptKeys: true });
  await decryptCredentials(credentials);
  if (credentials.some((row) => isPasskeyLocked(row.apiKey))) {
    throw new CredentialVaultError("This passkey does not match the one that encrypted your keys.");
  }
  notify();
};

/** Opens the app lock. One prompt also unlocks the API keys when they are passkey-encrypted. */
export const unlockApp = async (): Promise<void> => {
  const config = readVaultConfig();
  if (!config.passkey) return;
  if (config.encryptKeys) {
    await unlockWithPasskey();
    return;
  }
  await verifyPasskey(config.passkey);
  passkeyVerified = true;
  notify();
};

/**
 * Asks for the passkey only if some of these keys are passkey-encrypted and still locked.
 * Call it from a user action, such as sending a message. Returns whether it unlocked anything.
 */
export const ensureCredentialsUnlocked = async (
  credentials: readonly StoredCredential[],
): Promise<boolean> => {
  await decryptCredentials(credentials);
  const locked = credentials.some((row) => isPasskeyLocked(row.apiKey));
  if (!locked) return false;
  await unlockWithPasskey(credentials);
  return true;
};

/** Encrypts an API key with the configured protection. */
export const sealApiKey = async (apiKey: string): Promise<string> => {
  if (!apiKey) return "";
  const config = readVaultConfig();
  if (config.encryptKeys && !passkeyKey) await unlockWithPasskey();
  const sealed =
    config.encryptKeys && passkeyKey
      ? `${PASSKEY_PREFIX}${passkeyKey.credentialId}.${passkeyKey.salt}.${await encrypt(passkeyKey.key, apiKey)}`
      : `${DEVICE_PREFIX}${await encrypt(await getDeviceKey(), apiKey)}`;
  plaintextBySealed.set(sealed, apiKey);
  notify();
  return sealed;
};

/** Whether a new key can be sealed without asking for the passkey. */
export const canSealSilently = (): boolean => !readVaultConfig().encryptKeys || passkeyKey !== null;

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

const adoptPasskey = (created: CreatedPasskey): VaultPasskey => {
  const passkey = { credentialId: created.credentialId, salt: created.salt };
  passkeyKey = created.key ? { ...passkey, key: created.key } : null;
  passkeyVerified = true;
  return passkey;
};

/**
 * Turns passkey encryption of API keys on or off and re-encrypts every readable key. Turning it
 * on deletes the device key, so copies sealed with it in LiveStore history can no longer be
 * decrypted. Commit the returned rows.
 */
export const setKeyEncryption = async (
  enabled: boolean,
  credentials: readonly StoredCredential[],
): Promise<SealedCredential[]> => {
  const config = readVaultConfig();
  await decryptCredentials(credentials);
  if (enabled) {
    if (readCredentialVaultState(credentials).locked) {
      throw new CredentialVaultError("Unlock your API keys before changing how they're encrypted.");
    }
    let passkey = config.passkey;
    if (passkey && passkeyKey?.credentialId !== passkey.credentialId) {
      try {
        passkeyKey = {
          ...passkey,
          key: await deriveKey(await evaluatePrf(passkey.credentialId, passkey.salt)),
        };
        passkeyVerified = true;
      } catch (error) {
        // The app-lock passkey can't encrypt; replace it with one that can.
        if (!(error instanceof CredentialVaultError && error.message === PRF_UNSUPPORTED_MESSAGE)) {
          throw error;
        }
        passkey = null;
      }
    }
    if (!passkey) {
      const created = await createPasskey();
      if (!created.key) throw new CredentialVaultError(PRF_UNSUPPORTED_MESSAGE);
      passkey = adoptPasskey(created);
    }
    writeVaultConfig({ ...config, passkey, encryptKeys: true });
    const resealed = await resealAll(credentials);
    await deleteDeviceKey();
    return resealed;
  }

  if (credentials.some((row) => isPasskeyLocked(row.apiKey))) {
    await unlockWithPasskey(credentials);
  }
  writeVaultConfig({ ...config, encryptKeys: false });
  const resealed = await resealAll(credentials);
  if (!config.lockApp) passkeyKey = null;
  notify();
  return resealed;
};

/** Turns the lock screen on or off. Turning it on creates a passkey if there isn't one yet. */
export const setAppLock = async (enabled: boolean): Promise<void> => {
  const config = readVaultConfig();
  if (!enabled) {
    writeVaultConfig({ ...config, lockApp: false });
    return;
  }
  const passkey = config.passkey ?? adoptPasskey(await createPasskey());
  writeVaultConfig({ ...config, passkey, lockApp: true });
};

/** For a lost passkey: stops asking for it. Keys it sealed stay unreadable and must be re-entered. */
export const forgetPasskey = (): void => {
  passkeyKey = null;
  passkeyVerified = false;
  writeVaultConfig(DEFAULT_CONFIG);
};

/** Forgets decrypted keys and the passkey-derived key, as after a restart. */
export const lockCredentials = (): void => {
  passkeyKey = null;
  passkeyVerified = false;
  plaintextBySealed.clear();
  notify();
};
