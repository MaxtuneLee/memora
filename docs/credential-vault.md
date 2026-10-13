# Provider API key encryption

Memora keeps provider API keys in the LiveStore `provider_credentials` table. LiveStore persists its state and event log in OPFS, which is a plain folder in the browser profile, so anything that can read the disk could read the keys. Keys are therefore encrypted before they are committed. The code is in `packages/web/src/lib/settings/credentialVault.ts`.

## Stored format

The encrypted key replaces the plaintext in the `apiKey` column and in the `v1.ProviderCredentialSet` event. It is a self-describing string with base64url parts:

```text
mv1.<credentialId>.<salt>.<iv>.<ciphertext>   passkey protected
md1.<iv>.<ciphertext>                         device key (fallback)
```

The format carries the passkey credential ID and PRF salt, so no other storage is needed to unlock it. A value without one of these prefixes is a plaintext key saved before encryption.

## Passkey (`mv1`)

1. The first time a key is saved, Memora creates a passkey with the WebAuthn PRF extension and a random 32-byte salt.
2. The PRF output for that salt goes through HKDF-SHA-256 (info `memora provider api keys v1`) to make a non-extractable AES-GCM-256 key.
3. Each key is encrypted with a fresh 12-byte IV.

The AES key and the decrypted API keys exist only in memory. After each page load, the keys are locked until the user unlocks them with the passkey, from the prompt in the corner of the app or by editing a provider in Settings. Cloud model calls made while the keys are locked are sent without a key.

The passkey is held by the operating system or a security key, so a copy of the browser profile is not enough to decrypt the keys.

## Device key (`md1`)

Browsers or authenticators without PRF support fall back to a non-extractable AES-GCM key generated with WebCrypto and stored in IndexedDB (`memora-credential-vault`). These keys unlock automatically. This keeps them out of OPFS and out of the LiveStore event log, but someone with a full copy of the browser profile can still use the device key. Once a device has device-sealed keys, new keys use the device key too.

## Migration and limits

- Keys saved before encryption stay readable. The app offers to encrypt them, which re-saves each one sealed.
- Older plaintext events stay in the LiveStore event log, because LiveStore cannot rewrite history. Early versions also wrote keys into `v1.ProviderCreated` and `v1.ProviderUpdated` events. To fully remove an exposed key, rotate it with the provider.
- If the passkey is deleted or lost, the keys cannot be recovered. Enter them again in Settings.
- API keys are never part of a data export (see `docs/data-export-format.md`).
