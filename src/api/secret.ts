// Generic secret encryption — AES-256-GCM via the `enc:v1:` envelope.
// Used by ModelNexus (API keys) and MotherAgent (SSH passwords).
import { invoke } from '@tauri-apps/api/core';

// Local `echobird_core` (fork build) declares both commands as
// `decrypt_secret(input: DecryptInput)` / `encrypt_secret(input: EncryptInput)`
// where each input struct carries `{ ciphertext, passphrase }` /
// `{ plaintext, passphrase }`. The previous JS sent a single positional
// field (e.g. `{ encrypted }`), which Tauri rejected at runtime with
// `missing required key input`. Wrap the args in the right struct shape
// before invoking.
export async function decryptSecret(encrypted: string, passphrase = ''): Promise<string> {
  const out = await invoke<{ plaintext: string }>('decrypt_secret', {
    input: { ciphertext: encrypted, passphrase },
  });
  return out.plaintext;
}

export async function encryptSecret(plaintext: string, passphrase = ''): Promise<string> {
  const out = await invoke<{ ciphertext: string }>('encrypt_secret', {
    input: { plaintext, passphrase },
  });
  return out.ciphertext;
}
