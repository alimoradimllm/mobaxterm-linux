export type SessionType = 'SSH' | 'Telnet' | 'Rdp' | 'Vnc' | 'WSL' | 'Shell' | 'Serial' | 'Unix';

export interface Session {
  name: string;
  session_type: SessionType | string;
  host?: string;
  username?: string;
  port?: number;
  folder?: string;
  working_directory?: string;
  favorite?: boolean;
  shell?: string;
  remote_shell?: string;
  ssh_agent_forwarding?: boolean;
  wsl_user?: string;
  wsl_command?: string;
  serial_baud?: number;
  serial_data_bits?: number;
  serial_parity?: string;
  serial_stop_bits?: number;
  serial_flow_control?: string;
  telnet_mode?: string;
  unix_shell?: string;
  unix_runtime_root?: string;
  unix_host_mount?: string;
  rdp_width?: number;
  rdp_height?: number;
  rdp_fullscreen?: boolean;
  rdp_audio?: boolean;
  vnc_display?: number;
  vnc_view_only?: boolean;
  vnc_shared?: boolean;
}

export interface TerminalEvent {
  id?: string;
  data?: string;
  error?: string;
}

type Invoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;

interface TauriGlobal {
  core?: { invoke?: Invoke };
  event?: { listen?: Listen };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export const tauriInvoke = window.__TAURI__?.core?.invoke;
export const tauriListen = window.__TAURI__?.event?.listen;

export const fallbackSessions: Session[] = [
  { name: 'Local Shell', session_type: 'Shell' },
  { name: 'WSL-Debian', session_type: 'WSL', host: 'Debian' },
];

export function normalizeTerminalEvent(value: unknown): TerminalEvent {
  let payload = (value as { payload?: unknown } | null)?.payload ?? value;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return {}; }
  }
  return payload && typeof payload === 'object' ? payload as TerminalEvent : {};
}
