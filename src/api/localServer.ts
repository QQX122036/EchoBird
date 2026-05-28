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

export async function getLlmServerLogs(): Promise<string[]> {
  return invoke('get_llm_server_logs');
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

export async function scanHfModels(dir: string): Promise<HfModelEntry[]> {
  return invoke('scan_hf_models', { dir });
}

export async function addModelsDir(): Promise<string[]> {
  return invoke('add_models_dir');
}

export async function removeModelsDir(dir: string): Promise<string[]> {
  return invoke('remove_models_dir', { dir });
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
export async function downloadModel(repo: string, files: string[]): Promise<string> {
  return invoke('download_model', { repo, files });
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
