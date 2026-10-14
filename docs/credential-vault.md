# API key protection and the passkey lock

Memora keeps provider API keys in the LiveStore `provider_credentials` table. LiveStore persists its state and event log in OPFS, which is a plain folder in the browser profile, so keys are encrypted before they are committed. The code is in `packages/web/src/lib/settings/credentialVault.ts`, and people choose the mode in **Settings > Security**.

## Settings

Settings > Security has two independent switches that share one passkey. When both are on, one prompt opens the app and decrypts the keys.

| Switch                          | Off                                                                                        | On                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encrypt API keys with a passkey | Keys use a non-extractable AES-GCM-256 device key in IndexedDB (`memora-credential-vault`) | Keys use an AES-GCM-256 key derived from the passkey's WebAuthn PRF output with HKDF-SHA-256. Memora asks for the passkey the first time a key is needed, such as when sending a chat message. |
| Lock Memora when it opens       | No lock screen                                                                             | A lock screen appears before the workspace loads. With encryption off, the passkey is only verified; it needs no PRF support.                                                                  |

The device key protects against reading OPFS files, LiveStore devtools, and data exports, but not against a full copy of the browser profile, which contains the device key too. Passkey encryption also protects against that.

The lock screen is a gate in the app, not disk encryption: library files and chats in OPFS stay readable on disk.

## Stored format

The encrypted key replaces the plaintext in the `apiKey` column and in the `v1.ProviderCredentialSet` event. It is a self-describing string with base64url parts:

```text
mv1.<credentialId>.<salt>.<iv>.<ciphertext>   passkey
md1.<iv>.<ciphertext>                         device key
```

A value without one of these prefixes is a plaintext key from before encryption. Memora encrypts such keys with the current mode the first time it runs.

The settings are kept in `localStorage` under `memora.credentialVault.v2` as `{ "passkey": { "credentialId", "salt" } | null, "encryptKeys", "lockApp" }`. They hold no secret. They live outside LiveStore because the lock screen has to decide before LiveStore starts. The first version's `memora.credentialVault.v1` `{ "mode": "passkey" }` reads as both switches on. If the settings are missing while passkey-sealed keys exist, Memora shows an unlock dialog after start and saves the passkey again.

## Turning things on and off

- **Encryption on** uses the existing passkey if it supports PRF, or creates one, re-encrypts every key with it, and deletes the device key from IndexedDB. Device-sealed copies left in LiveStore history then can't be decrypted.
- **Encryption off** re-encrypts every key with a new device key.
- **Lock on** creates a passkey if there isn't one. **Lock off** just removes the lock screen.
- The passkey setting is dropped once both switches are off.
- **Lost passkey:** Settings > Security shows "Remove passkey" whenever a passkey is set up or keys are sealed with one. After a confirmation, it deletes the API keys of every provider and turns both switches off; the keys are entered again in Providers. "Lost your passkey?" on the lock screen only turns the switches off, because LiveStore isn't loaded yet; the unlock dialog after start then offers to remove the keys that passkey sealed.

## Limits

- LiveStore records the previous value of every row it changes (`__livestore_session_changeset`), keeps the event log forever, and leaves state databases from earlier schemas in OPFS. Keys that were stored as plaintext before encryption therefore stay readable in those places, and so does the plaintext a key had right before Memora encrypted it. To fully retire such a key, create a new one with the provider. Keys first entered after encryption are only ever written encrypted.
- Early versions also wrote keys into the synced `v1.ProviderCreated` and `v1.ProviderUpdated` events.
- API keys are never part of a data export (see `docs/data-export-format.md`).
