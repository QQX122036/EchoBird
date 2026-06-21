// "我的AI生涯" (My AI Career) IPC layer — cross-tool session history,
// contribution heatmap, and profile avatar. Backed by the Rust
// `ai_career` service + `set_avatar` / `get_avatar` commands.

import { invoke } from '@tauri-apps/api/core';

/// The four first-class tool families. CLI + desktop variants of a family
/// fold into one (they share a session store on disk).
export type AiCareerFamily = 'claude' | 'codex' | 'opencode' | 'hermes' | 'mimo';

export interface SavedSession {
  id: string;
  name: string;
  tool: string;
  cwd: string;
  session_token: string | null;
  saved_at: string;
  file_path: string | null;
  turn_count: number | null;
}

export interface HeatmapEntry {
  /// File mtime, seconds since the UNIX epoch.
  ts: number;
  /// Approximate message count for the session.
  count: number;
}

/// One page of a single family's session history, newest first. The page is
/// scanned + parsed on the Rust side; the caller pages in more via `offset`.
export async function aiCareerFamilyHistory(
  family: AiCareerFamily,
  offset: number,
  limit: number
): Promise<SavedSession[]> {
  return invoke('ai_career_family_history', { family, offset, limit });
}

/// Contribution-heatmap entries across all four families (210-day lookback).
export async function aiCareerHeatmap(): Promise<HeatmapEntry[]> {
  return invoke('ai_career_heatmap');
}

/// Total on-disk byte size across all four families' session files. The
/// frontend divides this by a bytes-per-token ratio for an approximate ("≈")
/// cumulative token count — works even when a provider doesn't report real
/// usage (third-party models often log 0), since it measures content volume.
export async function aiCareerTokenBytes(): Promise<number> {
  return invoke('ai_career_token_bytes');
}

/// Set the profile avatar from a user-picked image file (re-encoded to a
/// 256px PNG on the Rust side).
// Local `echobird_core` declares `set_avatar(src_path: String)`. Rename
// the JS key from `sourcePath` to `srcPath` so the Tauri command
// macro can find the matching snake_case parameter at runtime
// (otherwise it errors with `missing required key src_path`).
export async function setAvatar(sourcePath: string): Promise<void> {
  return invoke('set_avatar', { srcPath: sourcePath });
}

/// Read the stored avatar as a base64 PNG data URI, or `null` if unset.
export async function getAvatar(): Promise<string | null> {
  return invoke('get_avatar');
}
