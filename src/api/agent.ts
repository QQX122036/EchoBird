// Agent APIs — Mother Agent send/abort/reset/listen
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentRequest, AgentEvent } from './types';

// Local `echobird_core` (fork build) declares the IPC command as
// `agent_send_message(app, input: AgentSendInput)`. Tauri's `#[command]`
// macro matches JS args by the Rust parameter name, so the JS side
// must hand the request over under the key `input` (the previous
// `request` key produced "missing required key input" at runtime).
// The upstream build uses `request`; this fork uses `input`. The two
// shapes are interchangeable on the wire because the inner payload is
// identical — only the wrapping key differs.
export async function sendAgentMessage(request: AgentRequest): Promise<string> {
  // Diagnostic: log the invoke attempt and the resolution.
  const t0 = performance.now();
  console.log('[agent.ts] sendAgentMessage: invoke start, message_len=', request.message.length);
  try {
    localStorage.setItem('echobird_invoke_log',
      (localStorage.getItem('echobird_invoke_log') || '') +
      '[' + new Date().toISOString() + '] invoke start msg_len=' + request.message.length + '\n');
  } catch {}
  try {
    const result = await invoke('agent_send_message', { input: request });
    console.log('[agent.ts] sendAgentMessage: invoke resolved in', (performance.now() - t0).toFixed(0), 'ms');
    try {
      localStorage.setItem('echobird_invoke_log',
        (localStorage.getItem('echobird_invoke_log') || '') +
        '[' + new Date().toISOString() + '] invoke OK in ' + (performance.now() - t0).toFixed(0) + 'ms\n');
    } catch {}
    return result;
  } catch (err) {
    console.error('[agent.ts] sendAgentMessage: invoke REJECTED:', err);
    try {
      localStorage.setItem('echobird_invoke_log',
        (localStorage.getItem('echobird_invoke_log') || '') +
        '[' + new Date().toISOString() + '] invoke REJECTED: ' + String(err).slice(0, 200) + '\n');
    } catch {}
    throw err;
  }
}

// Local `echobird_core` exposes `agent_reset` / `agent_abort` as
// parameterless commands. The historical signature accepted a
// `serverKey` arg, which the local core silently ignored, but
// forwarding it now would be misleading: drop it.
export async function abortAgent(): Promise<boolean> {
  return invoke('agent_abort');
}

export async function resetAgent(): Promise<string> {
  return invoke('agent_reset');
}

export function listenAgentEvents(handler: (event: AgentEvent) => void): Promise<UnlistenFn> {
  // Local echobird_core emits on the `agent-event` channel (Tauri 2
  // convention uses the dashed form; the previous underscore form silently
  // dropped every event). Use a literal hyphenated name.
  return listen<AgentEvent>('agent-event', (e) => handler(e.payload));
}
