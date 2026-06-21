// SSH APIs — server persistence + connection testing
// Generic secret encrypt/decrypt lives in ./secret.ts (used by both SSH passwords
// and model API keys; same AES-GCM crypto, neutral name).
import { invoke } from '@tauri-apps/api/core';

export interface SSHConnectResult {
  success: boolean;
  message: string;
}

export async function sshTestConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<SSHConnectResult> {
  return invoke('ssh_test_connection', { host, port, username, password });
}

export interface SSHServer {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string; // encrypted (enc:v1:...)
  alias?: string; // user-defined display name
}

export async function loadSSHServers(): Promise<SSHServer[]> {
  return invoke('load_ssh_servers');
}

// Local `echobird_core` declares `save_ssh_server(server: SshServer)`
// where `SshServer` carries `{ id, name, host, port, user, key_path }`
// (camelCase on the wire). The JS `SSHServer` interface still uses
// `username` / `password` / `alias` to match the historical upstream
// contract — reshape the call into the local core's struct so the
// IPC layer doesn't reject it with `missing required key server`.
//
// Password auth isn't part of the local-core persistence schema
// (`key_path` is for SSH-key auth). The password is only used by the
// immediate `ssh_test_connection` call; the persisted record is the
// `name/host/port/user` triple the dropdown displays. Pass `null`
// for `key_path` so the record is still well-formed and the
// connection test path isn't disturbed.
export async function saveSSHServer(
  id: string,
  host: string,
  port: number,
  username: string,
  password: string,
  alias?: string
): Promise<SSHServer> {
  await invoke('save_ssh_server', {
    server: {
      id,
      name: alias ?? username,
      host,
      port,
      user: username,
      keyPath: null,
    },
  });
  return { id, host, port, username, password, alias };
}

export async function removeSSHServerFromDisk(id: string): Promise<boolean> {
  return invoke('remove_ssh_server', { id });
}
