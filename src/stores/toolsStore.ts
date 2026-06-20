// Tools store — shared state for detected tools and scanning
// Used by: App.tsx (init), AppManagerProvider, MotherAgentProvider

import { create } from 'zustand';
import * as api from '../api/tauri';
import type { LocalTool } from '../api/types';

interface ToolsState {
  detectedTools: LocalTool[];
  isScanning: boolean;
  modelProtocolSelection: Record<string, 'openai' | 'anthropic'>;

  setDetectedTools: (tools: LocalTool[] | ((prev: LocalTool[]) => LocalTool[])) => void;
  setModelProtocolSelection: (
    sel:
      | Record<string, 'openai' | 'anthropic'>
      | ((prev: Record<string, 'openai' | 'anthropic'>) => Record<string, 'openai' | 'anthropic'>)
  ) => void;
  scanTools: () => Promise<void>;
}

export const useToolsStore = create<ToolsState>((set, _get) => ({
  detectedTools: [],
  isScanning: false,
  modelProtocolSelection: {},

  setDetectedTools: (tools) =>
    set((state) => ({
      detectedTools: typeof tools === 'function' ? tools(state.detectedTools) : tools,
    })),

  setModelProtocolSelection: (sel) =>
    set((state) => ({
      modelProtocolSelection: typeof sel === 'function' ? sel(state.modelProtocolSelection) : sel,
    })),

  scanTools: async () => {
    set({ isScanning: true });
    try {
      const tools = await api.scanTools();
      set({ detectedTools: tools });
    } catch (e) {
      // Don't swallow scan errors silently — the previous behavior
      // (`catch { /* ignore */ }`) made a JSON deserialization
      // regression in the Rust backend invisible: every install
      // entry failed to parse, `scan_tools` returned Err, and the
      // user stared at an empty App Manager with no log. Surface
      // the error to the dev console so the next regression of
      // this shape is at least diagnosable in dev mode. We still
      // leave `detectedTools` untouched on failure (a stale list
      // is more useful than a flash of empty), matching the
      // original "keep what we had" semantics.
      console.error('[toolsStore] scan_tools IPC failed:', e);
    }
    set({ isScanning: false });
  },
}));
