import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  lockCredentials,
  peekApiKey,
  readCredentialVaultState,
  sealApiKey,
  unlockCredentials,
} from "@/lib/settings/credentialVault";

let prfSecret = new Uint8Array(32).fill(7);
const prfResult = () => ({ prf: { enabled: true, results: { first: prfSecret } } });
const create = vi.fn(async () => ({
  rawId: new Uint8Array([1, 2, 3]).buffer,
  getClientExtensionResults: prfResult,
}));
const get = vi.fn(async () => ({ getClientExtensionResults: prfResult }));

beforeEach(() => {
  prfSecret = new Uint8Array(32).fill(7);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("navigator", { credentials: { create, get } });
});

afterEach(() => {
  lockCredentials();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("seals keys with a passkey and unlocks them only with the same passkey", async () => {
  const sealed = await sealApiKey("sk-secret", []);
  expect(sealed).toMatch(/^mv1\./);
  expect(sealed).not.toContain("sk-secret");
  expect(peekApiKey(sealed)).toBe("sk-secret");

  const credentials = [{ providerId: "p", apiKey: sealed }];
  const second = await sealApiKey("sk-other", credentials);
  expect(create).toHaveBeenCalledOnce();
  expect(second.split(".").slice(0, 3)).toEqual(sealed.split(".").slice(0, 3));

  lockCredentials();
  expect(peekApiKey(sealed)).toBe("");
  expect(readCredentialVaultState(credentials)).toEqual({ locked: true, plaintext: false });

  prfSecret = new Uint8Array(32).fill(9);
  await expect(unlockCredentials(credentials)).rejects.toThrow(/does not match/);
  expect(peekApiKey(sealed)).toBe("");

  lockCredentials();
  prfSecret = new Uint8Array(32).fill(7);
  await unlockCredentials(credentials);
  expect(peekApiKey(sealed)).toBe("sk-secret");
});

test("passes plaintext keys through and reports them", () => {
  expect(peekApiKey("sk-plain")).toBe("sk-plain");
  expect(readCredentialVaultState([{ providerId: "p", apiKey: "sk-plain" }])).toEqual({
    locked: false,
    plaintext: true,
  });
});
