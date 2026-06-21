// Local Server APIs — LLM server management, engine install, model scanning, GPU detection
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { LocalServerInfo, GgufFile, HfModelEntry, StoreModel } from './types';

export async function startLlmServer(
  modelPath: string,
  port: number,
  gpuLayers?: number,
  contextSize?: number,
  runtime?: string
): Promise<void> {
  return invoke('start_llm_server', {
    modelPath,
    port,
    gpuLayers: gpuLayers ?? null,
    contextSize: contextSize ?? null,
    runtime: runtime ?? null,
  });
}

export async function stopLlmServer(): Promise<void> {
  return invoke('stop_llm_server');
}

export async function getLlmServerInfo(): Promise<LocalServerInfo> {
  return invoke('get_llm_server_info');
}

// Local `echobird_core` declares `get_llm_server_logs(lines: u32)`.
// The local core currently returns an empty string regardless of
// `lines`, but Tauri still requires the key to be present, so we
// default to 200 lines (matches the historical upstream behavior).
export async function getLlmServerLogs(lines = 200): Promise<string[]> {
  const raw = await invoke<string>('get_llm_server_logs', { lines });
  return raw ? raw.split('\n') : [];
}

// ─── Custom launch command (advanced / bring-your-own engine) ───
// One executable + its args (no shell parsing — each element is verbatim).
export interface LlamaCommand {
  exe: string;
  args: string[];
}

/** The auto-computed default command for a model — used to prefill the gear dialog. */
export async function getLlmDefaultCommand(
  modelPath: string,
  port: number,
  gpuLayers?: number,
  contextSize?: number
): Promise<LlamaCommand> {
  return invoke('get_llm_default_command', {
    modelPath,
    port,
    gpuLayers: gpuLayers ?? null,
    contextSize: contextSize ?? null,
  });
}

/** The stored global custom command, or null if none (auto mode). */
export async function getLlmCustomCommand(): Promise<LlamaCommand | null> {
  return invoke('get_llm_custom_command');
}

export async function setLlmCustomCommand(exe: string, args: string[]): Promise<void> {
  return invoke('set_llm_custom_command', { exe, args });
}

export async function clearLlmCustomCommand(): Promise<void> {
  return invoke('clear_llm_custom_command');
}

export async function getModelsDirs(): Promise<string[]> {
  return invoke('get_models_dirs');
}

export async function getDownloadDir(): Promise<string> {
  return invoke('get_download_dir');
}

export async function scanGgufFiles(dir: string): Promise<GgufFile[]> {
  return invoke('scan_gguf_files', { dir });
}

// Local `echobird_core` declares `scan_hf_models(repo: String)`. Rename
// the JS key from `dir` to `repo` so the IPC finds the matching
// snake_case parameter (otherwise it errors with
// `missing required key repo`).
export async function scanHfModels(repo: string): Promise<HfModelEntry[]> {
  return invoke('scan_hf_models', { repo });
}

export async function addModelsDir(): Promise<string[]> {
  return invoke('add_models_dir');
}

// Local `echobird_core` declares `remove_models_dir(path: String)`.
// Rename the JS key from `dir` to `path` so the IPC finds the
// matching snake_case parameter.
export async function removeModelsDir(path: string): Promise<string[]> {
  return invoke('remove_models_dir', { path });
}

export async function detectGpu(): Promise<{ gpuName: string; gpuVramGb: number } | null> {
  return invoke('detect_gpu');
}

export async function getGpuInfo(): Promise<{ gpuName: string; gpuVramGb: number } | null> {
  return invoke('get_gpu_info');
}

export interface SystemInfo {
  os: string; // "windows" | "macos" | "linux"
  arch: string; // "x86_64" | "aarch64"
  hasNvidiaGpu: boolean;
  hasAmdGpu?: boolean;
  gpuName: string | null;
  gpuVramGb: number | null;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke('get_system_info');
}

export async function setDownloadDir(): Promise<string> {
  return invoke('set_download_dir');
}

export async function getStoreModels(): Promise<StoreModel[]> {
  return invoke('get_store_models');
}

/** Trigger a GGUF model download. Pass a single-element array for single-file
 *  models, multiple elements (in shard order) for sharded multi-file GGUFs. */
// Local `echobird_core` declares `download_model(url: String, dest: String)`
// and currently returns `not_implemented`. The public repo's JS still
// tracks the upstream's `(repo, files)` shape — translate the call into
// the local core's `(url, dest)` signature so the IPC layer doesn't
// reject it with `missing required key url/dest`. The function will
// still reject with `not_implemented`; callers should fall back to the
// browser-side fetch path the DownloadContext already uses for the
// actual transfer.
export async function downloadModel(repo: string, files: string[]): Promise<string> {
  return invoke('download_model', { url: repo, dest: files.join(',') });
}

export interface LocalEngineEntry {
  name: string;
  installed: boolean;
  version: string;
  latestVersion?: string;
  installDir?: string;
  binaryNames?: string[];
}

export interface LocalEngineStatus {
  engines: LocalEngineEntry[];
}

export async function getLocalEngineStatus(runtime?: string): Promise<LocalEngineStatus> {
  return invoke('get_local_engine_status', { runtime: runtime ?? null });
}

export interface InstallEngineOverrides {
  /** Specific release tag to install, e.g. "b9100". Auto-latest when omitted. */
  version?: string;
  /** CUDA major.minor for the picked Windows build, e.g. "12.6". */
  cudaVersion?: string;
}

export async function installLocalEngine(
  runtime: string,
  overrides?: InstallEngineOverrides
): Promise<void> {
  return invoke('install_local_engine', {
    runtime,
    version: overrides?.version ?? null,
    cudaVersion: overrides?.cudaVersion ?? null,
  });
}

export interface LlamaReleaseOption {
  /** Release tag, e.g. "b9100". */
  tag: string;
  /** CUDA major.minor parsed from the asset name, e.g. "12.6". */
  cudaVersion: string;
  /** Original asset filename — for display / debug only. */
  assetName: string;
  /** Asset size in bytes. */
  sizeBytes: number;
}

/**
 * Fetch top N most recent llama.cpp releases, flattened to one entry
 * per Windows CUDA variant. Empty array on network failure — caller
 * should fall back to auto-latest install.
 */
export async function listEngineReleaseOptions(
  runtime: string,
  topN?: number
): Promise<LlamaReleaseOption[]> {
  return invoke('list_engine_release_options', {
    runtime,
    topN: topN ?? null,
  });
}

export async function pauseDownload(): Promise<void> {
  return invoke('pause_download');
}

/** Cancel the in-progress download. Pass the variant's `files` array when
 *  cancelling from a paused state (DOWNLOAD_FILE was already cleared); leave
 *  empty to wipe whatever the backend currently has in flight. */
export async function cancelDownload(files?: string[]): Promise<void> {
  return invoke('cancel_download', { files: files && files.length ? files : null });
}

// Download progress event listener

export interface DownloadProgressEvent {
  /** Primary key — for multi-shard downloads stays pinned to the first shard
   *  so the download UI's Map<fileName, …> keeps working across the job. */
  fileName: string;
  progress: number;
  downloaded: number;
  total: number;
  status:
    | 'downloading'
    | 'completed'
    | 'error'
    | 'cancelled'
    | 'paused'
    | 'speed_test'
    | 'installing';
  /** 1-based shard counter for multi-shard GGUF downloads. Absent for single-file. */
  shardIndex?: number;
  /** Total number of shards in the variant. Absent for single-file. */
  shardCount?: number;
}

export function onDownloadProgress(
  callback: (data: DownloadProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<DownloadProgressEvent>('download-progress', (event) => {
    callback(event.payload);
  });
}
