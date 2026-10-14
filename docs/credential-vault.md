# API key protection and the passkey lock

Memora keeps provider API keys in the LiveStore `provider_credentials` table. LiveStore persists its state and event log in OPFS, which is a plain folder in the browser profile, so keys are encrypted before they are committed. The code is in `packages/web/src/lib/settings/credentialVault.ts`, and people choose the mode in **Settings > Security**.

## Modes

| Mode                 | Key                                                                              | Opening Memora                                               | Protects against                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Device key (default) | Non-extractable AES-GCM-256 key in IndexedDB (`memora-credential-vault`)         | No prompt                                                    | Reading OPFS files, LiveStore devtools, data exports. Not a full copy of the browser profile, which contains the device key too.          |
| Passkey lock         | AES-GCM-256 key derived from the passkey's WebAuthn PRF output with HKDF-SHA-256 | Lock screen before the workspace loads; unlock once per load | Anything that only has the disk. The PRF output needs the passkey and user verification (Touch ID, Face ID, Windows Hello, security key). |

The lock screen is a gate in the app, not disk encryption: library files and chats in OPFS stay readable on disk. Only API keys are encrypted.

## Stored format

The encrypted key replaces the plaintext in the `apiKey` column and in the `v1.ProviderCredentialSet` event. It is a self-describing string with base64url parts:

```text
mv1.<credentialId>.<salt>.<iv>.<ciphertext>   passkey
md1.<iv>.<ciphertext>                         device key
```

A value without one of these prefixes is a plaintext key from before encryption. Memora encrypts such keys with the current mode the first time it runs.

The mode is kept in `localStorage` under `memora.credentialVault.v1` as `{ "mode": "device" }` or `{ "mode": "passkey", "credentialId", "salt" }`. It holds no secret. It lives outside LiveStore because the lock screen has to decide before LiveStore starts. If it is missing while passkey-sealed keys exist, Memora shows an unlock dialog after start and saves the mode again.

## Passkey lock

- **Turning it on** creates a passkey with the PRF extension and a random 32-byte salt, re-encrypts every key with it, and deletes the device key from IndexedDB. Device-sealed copies left in LiveStore history then cannot be decrypted.
- **Opening Memora** shows the lock screen before LiveStore loads. Memora asks for the passkey right away where the browser allows it, and otherwise waits for a click on Unlock. The derived key stays in memory for that page load, so using API keys afterwards needs no further prompts.
- **Turning it off** re-encrypts every key with a new device key.
- **Losing the passkey:** "Lost your passkey?" on the lock screen turns the lock off. Keys sealed with that passkey can't be recovered; the unlock dialog after start offers to remove them so they can be entered again.

Browsers or passkey providers without PRF support can't turn the lock on; Settings shows why.

## Limits

- LiveStore records the previous value of every row it changes (`__livestore_session_changeset`), keeps the event log forever, and leaves state databases from earlier schemas in OPFS. Keys that were stored as plaintext before encryption therefore stay readable in those places, and so does the plaintext a key had right before Memora encrypted it. To fully retire such a key, create a new one with the provider. Keys first entered after encryption are only ever written encrypted.
- Early versions also wrote keys into the synced `v1.ProviderCreated` and `v1.ProviderUpdated` events.
- API keys are never part of a data export (see `docs/data-export-format.md`).
