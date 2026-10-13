import { useSyncExternalStore } from "react";

// Encrypts provider API keys before they reach LiveStore, whose state and event log live in
// OPFS and can be read straight from disk. Format and threat model: docs/credential-vault.md.
//
// A sealed key is a self-describing string stored where the plaintext key used to be:
//   mv1.<credentialId>.<salt>.<iv>.<ciphertext>  passkey (WebAuthn PRF) protected
//   md1.<iv>.<ciphertext>                        device key, for browsers without PRF
// All parts are base64url. Decrypted keys are kept only in memory for this page load.

export interface StoredCredential {
  providerId: string;
  apiKey: string;
}

export class CredentialVaultError extends Error {}

const PASSKEY_PREFIX = "mv1.";
const DEVICE_PREFIX = "md1.";
const HKDF_INFO = new TextEncoder().encode("memora provider api keys v1");
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

/** Re-renders the caller when keys are unlocked or locked. */
export const useCredentialVaultVersion = (): number =>
  useSyncExternalStore(subscribe, () => version);

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

const evaluatePrf = async (credentialId: string, salt: string): Promise<BufferSource> => {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
      userVerification: "required",
      extensions: { prf: { eval: { first: fromBase64Url(salt) } } },
    },
  })) as PublicKeyCredential | null;
  const secret = assertion?.getClientExtensionResults().prf?.results?.first;
  if (!secret) {
    throw new CredentialVaultError("This passkey cannot unlock API keys in this browser.");
  }
  return secret;
};

class PrfUnsupportedError extends CredentialVaultError {}

const createPasskeyKey = async (): Promise<PasskeyKey> => {
  if (typeof PublicKeyCredential === "undefined") {
    throw new PrfUnsupportedError("This browser does not support passkeys.");
  }
  const salt = toBase64Url(randomBytes(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Memora" },
      user: {
        id: randomBytes(16),
        name: "Memora API keys",
        displayName: "Memora API keys",
      },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      extensions: { prf: { eval: { first: fromBase64Url(salt) } } },
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new CredentialVaultError("Passkey setup was cancelled.");

  const prf = credential.getClientExtensionResults().prf;
  if (!prf?.enabled) {
    throw new PrfUnsupportedError("This passkey cannot encrypt API keys.");
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

// Fallback for browsers without the PRF extension: a non-extractable key in IndexedDB keeps keys
// out of OPFS, but anyone with the browser profile on disk can still use it.
const getDeviceKey = (): Promise<CryptoKey> => {
  deviceKeyPromise ??= (async () => {
    const open = indexedDB.open(DEVICE_DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    const db = await requestStore(open);
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

/** Asks for the passkey that sealed these keys. Needs a user gesture in some browsers. */
export const unlockCredentials = async (
  credentials: readonly StoredCredential[],
): Promise<void> => {
  const envelope = findPasskeyEnvelope(credentials);
  if (envelope && passkeyKey?.credentialId !== envelope.credentialId) {
    const key = await deriveKey(await evaluatePrf(envelope.credentialId, envelope.salt));
    passkeyKey = { ...envelope, key };
  }
  await decryptCredentials(credentials);
  if (readCredentialVaultState(credentials).locked) {
    throw new CredentialVaultError("This passkey does not match the one that encrypted your keys.");
  }
};

/**
 * Encrypts an API key for storage. Reuses the unlocked passkey, unlocks the existing one, or
 * sets up a new passkey; falls back to the device key when the browser has no PRF support.
 */
export const sealApiKey = async (
  apiKey: string,
  credentials: readonly StoredCredential[],
): Promise<string> => {
  if (!apiKey) return "";
  if (!passkeyKey) {
    const envelope = findPasskeyEnvelope(credentials);
    if (envelope) {
      await unlockCredentials(credentials);
    } else if (!credentials.some((row) => row.apiKey.startsWith(DEVICE_PREFIX))) {
      try {
        passkeyKey = await createPasskeyKey();
      } catch (error) {
        if (!(error instanceof PrfUnsupportedError)) throw error;
      }
    }
  }

  const sealed = passkeyKey
    ? `${PASSKEY_PREFIX}${passkeyKey.credentialId}.${passkeyKey.salt}.${await encrypt(passkeyKey.key, apiKey)}`
    : `${DEVICE_PREFIX}${await encrypt(await getDeviceKey(), apiKey)}`;
  plaintextBySealed.set(sealed, apiKey);
  notify();
  return sealed;
};

/** Forgets decrypted keys and the passkey-derived key. */
export const lockCredentials = (): void => {
  passkeyKey = null;
  plaintextBySealed.clear();
  notify();
};
