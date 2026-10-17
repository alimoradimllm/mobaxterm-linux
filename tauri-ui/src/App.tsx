import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { iconFor } from './icons.js';
import SessionEditor from './SessionEditor';
import Settings, { defaultUiSettings, UiSettings } from './Settings';
import MacroManager, { Macro } from './MacroManager';
import MultiExecManager from './MultiExecManager';
import TunnelManager from './TunnelManager';
import ToolsPanel from './ToolsPanel';
import SftpPane from './SftpPane';
import {
  fallbackSessions,
  normalizeTerminalEvent,
  Session,
  tauriInvoke,
  tauriListen,
} from './react-types';

interface Tab {
  id: string;
  session: Session;
  state: 'starting' | 'connected' | 'failed' | 'exited';
  error?: string;
}

const remoteTypes = new Set(['SSH', 'TELNET', 'RDP', 'Rdp', 'VNC', 'Vnc', 'WSL', 'Serial', 'Unix', 'Shell']);

function Toolbar({ onNewShell, onHome, onEdit, onSettings, onMacros, onMultiExec, onSftp, onSplit, onDuplicate, onTools, onView, onTunnel, onHelp, onXserver }: { onNewShell: () => void; onHome: () => void; onEdit: () => void; onSettings: () => void; onMacros: () => void; onMultiExec: () => void; onSftp: () => void; onSplit: () => void; onDuplicate: () => void; onTools: () => void; onView: () => void; onTunnel: () => void; onHelp: () => void; onXserver: () => void }) {
  const items = [
    ['▣', 'Session', onNewShell], ['✣', 'Servers', onHome], ['⚒', 'Tools', onTools],
    ['★', 'Sessions', onEdit], ['▣', 'View', onView], ['▤', 'Split', onSplit],
    ['⧉', 'Duplicate', onDuplicate], ['⇄', 'MultiExec', onMultiExec], ['⇆', 'Tunneling', onTunnel],
    ['⇅', 'Packages', onSftp], ['⚙', 'Settings', onSettings], ['?', 'Help', onHelp],
  ] as const;
  return <div className="react-toolbar">
    {items.map(([symbol, label, action]) => <button key={label} className={label === 'Session' ? 'react-tool primary' : 'react-tool'} onClick={action} title={label}>
      <span aria-hidden="true">{symbol}</span><small>{label}</small>
    </button>)}
    <span className="react-toolbar-spacer" />
    <button className="react-tool" title="X server" onClick={onXserver}><span>⚔</span><small>X server</small></button>
    <button className="react-tool" title="Exit" onClick={() => window.close()}><span>⏻</span><small>Exit</small></button>
  </div>;
}

function ProtocolIcon({ type }: { type: string }) {
  return <span className="react-protocol-icon" dangerouslySetInnerHTML={{ __html: iconFor(type) }} />;
}

function SessionSidebar({ sessions, activeId, onOpen, onHome, onEdit, onTools, onMacros, onNotice }: {
  sessions: Session[]; activeId?: string; onOpen: (session: Session) => void; onHome: () => void; onEdit: (session: Session) => void; onTools: () => void; onMacros: () => void; onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => sessions.filter(session => JSON.stringify(session).toLowerCase().includes(query.toLowerCase())), [sessions, query]);
  const grouped = useMemo(() => visible.reduce<Record<string, Session[]>>((groups, session) => {
    const key = session.folder || session.session_type || 'Other';
    (groups[key] ||= []).push(session);
    return groups;
  }, {}), [visible]);
  return <aside className="react-sidebar">
    <div className="react-side-tabs"><button className="selected" onClick={onHome}>Sessions</button><button onClick={onTools}>Tools</button><button onClick={onMacros}>Macros</button></div>
    <div className="react-side-search"><input aria-label="Quick find sessions" placeholder="Quick find sessions" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="react-tree-header"><strong>★ User sessions</strong><button title="New folder" onClick={() => onNotice('Folder management is not available in the React workspace yet.')}>📁＋</button><button title="Edit selected session" onClick={() => { const selected = sessions.find(session => session.name === activeId); if (selected) onEdit(selected); else onNotice('Select a session before editing it.'); }}>✎</button><button title="Refresh sessions" onClick={onHome}>↻</button></div>
    <div className="react-session-list">
      {Object.entries(grouped).map(([group, entries]) => <section key={group}>
        <h3>{group}</h3>
        {entries.map(session => <button key={`${session.session_type}:${session.name}`} className={activeId === session.name ? 'react-session active' : 'react-session'} onClick={() => onOpen(session)} onDoubleClick={() => onOpen(session)}>
          <ProtocolIcon type={session.session_type} /><span><strong>{session.name}</strong><small>{session.host || session.session_type}</small></span><em>{session.favorite ? '★' : ''}</em>
        </button>)}
      </section>)}
      {!visible.length && <p className="react-empty">No matching sessions</p>}
    </div>
    <div className="react-side-footer"><span>▣ Remote monitoring</span><label><input type="checkbox" defaultChecked /> Follow terminal folder</label></div>
  </aside>;
}

function TerminalPane({ tab, settings, onState, onError, onClose }: { tab: Tab; settings: UiSettings; onState: (state: Tab['state']) => void; onError: (error: string) => void; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: settings.cursorBlink,
      fontSize: settings.fontSize,
      theme: { background: '#080b0e', foreground: '#e6edf3', cursor: '#55d6ff', green: '#25d18a', blue: '#55b9ff', yellow: '#ffd166' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    fit.fit();
    terminal.focus();
    terminalRef.current = terminal;
    const id = tab.id;
    const unlistenPromise = tauriListen?.('terminal-output', event => {
      const payload = normalizeTerminalEvent(event);
      if (payload.id === id && payload.data) { onState('connected'); terminal.write(payload.data); }
    });
    const exitPromise = tauriListen?.('terminal-exit', event => {
      const payload = normalizeTerminalEvent(event);
      if (payload.id === id) onState('exited');
    });
    const resize = terminal.onResize(({ cols, rows }) => { tauriInvoke?.('resize_terminal', { id, cols, rows }).catch(() => {}); });
    const data = terminal.onData(value => { tauriInvoke?.('write_terminal', { id, data: value }).catch(() => onState('failed')); });
    const selection = terminal.onSelectionChange(() => {
      const text = terminal.getSelection();
      if (text) navigator.clipboard?.writeText(text).catch(() => {});
    });
    const context = async (event: MouseEvent) => {
      event.preventDefault();
      const text = await navigator.clipboard?.readText();
      if (text) tauriInvoke?.('write_terminal', { id, data: text }).catch(() => onState('failed'));
    };
    hostRef.current.addEventListener('contextmenu', context);
    onState('starting');
    const session = remoteTypes.has(tab.session.session_type) ? tab.session : null;
    tauriInvoke?.('start_terminal', { id, session, program: null }).then(() => onState('connected')).catch(error => { onError(error instanceof Error ? error.message : String(error)); onState('failed'); });
    return () => {
      resize.dispose(); data.dispose(); selection.dispose();
      hostRef.current?.removeEventListener('contextmenu', context);
      Promise.resolve(unlistenPromise).then(unlisten => unlisten?.());
      Promise.resolve(exitPromise).then(unlisten => unlisten?.());
      tauriInvoke?.('close_terminal', { id }).catch(() => {});
      terminal.dispose();
    };
  }, []);
  const reconnect = async () => {
    onState('starting');
    try {
      await tauriInvoke?.('close_terminal', { id: tab.id });
      await tauriInvoke?.('start_terminal', { id: tab.id, session: remoteTypes.has(tab.session.session_type) ? tab.session : null, program: null });
      onState('connected');
    } catch (error) { onError(error instanceof Error ? error.message : String(error)); onState('failed'); }
  };
  const resume = async () => {
    try { await tauriInvoke?.('resume_terminal', { id: tab.id }); onState('connected'); } catch { onState('failed'); }
  };
  return <div className="react-terminal-pane">
    <div className="react-pane-bar"><span><ProtocolIcon type={tab.session.session_type} /> {tab.session.name}</span><span className="react-terminal-actions"><span className={`react-state ${tab.state}`}>{tab.state}</span><button onClick={resume} disabled={tab.state === 'starting'} title="Resume terminal process">Resume</button><button onClick={reconnect} title="Reconnect terminal">Reconnect</button><button onClick={onClose} title="Close terminal">Close</button></span></div>
    {tab.error && <div className="react-terminal-error" role="alert">{tab.error}</div>}
    <div className="react-terminal-host" ref={hostRef} tabIndex={0} onPointerDown={() => terminalRef.current?.focus()} onKeyDown={() => terminalRef.current?.focus()} />
  </div>;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(fallbackSessions);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [splitId, setSplitId] = useState<string>();
  const [editorSession, setEditorSession] = useState<Session>();
  const [panel, setPanel] = useState<'settings' | 'macros' | 'multiexec' | 'sftp' | 'tunnel' | 'tools'>();
  const [notice, setNotice] = useState<string>();
  const [uiSettings, setUiSettings] = useState<UiSettings>(() => { try { return { ...defaultUiSettings, ...JSON.parse(localStorage.getItem('moraxterm-settings') || '{}') }; } catch { return defaultUiSettings; } });
  const [quick, setQuick] = useState('');
  useEffect(() => {
    tauriInvoke?.<Session[]>('list_sessions').then(value => { if (Array.isArray(value) && value.length) setSessions(value); }).catch(() => {});
  }, []);
  const openSession = (session: Session) => {
    const existing = tabs.find(tab => tab.session.name === session.name && tab.session.session_type === session.session_type);
    if (existing) { setActiveId(existing.id); return; }
    const tab = { id: `tab-${Date.now()}-${tabs.length}`, session, state: 'starting' as const };
    setTabs(current => [...current, tab]); setActiveId(tab.id);
  };
  const closeTab = (id: string) => {
    tauriInvoke?.('close_terminal', { id }).catch(() => {});
    setTabs(current => {
      const remaining = current.filter(item => item.id !== id);
      setSplitId(currentSplit => currentSplit === id ? undefined : currentSplit);
      setActiveId(activeId === id ? remaining[remaining.length - 1]?.id : activeId);
      return remaining;
    });
  };
  const splitWorkspace = () => {
    if (!activeId) return;
    const next = tabs.find(tab => tab.id !== activeId);
    if (next) setSplitId(current => current === next.id ? undefined : next.id);
  };
  const openQuick = () => {
    const host = quick.trim();
    if (host) openSession({ name: host, host, session_type: 'SSH', port: 22 });
  };
  const saveSession = (session: Session) => {
    setSessions(current => [...current.filter(item => !(item.name === session.name && item.session_type === session.session_type)), session]);
    tauriInvoke?.('save_session', { session }).catch(() => {});
    setEditorSession(undefined);
  };
  const saveSettings = (next: UiSettings) => { setUiSettings(next); localStorage.setItem('moraxterm-settings', JSON.stringify(next)); setPanel(undefined); };
  const playMacro = (macro: Macro, terminalId: string) => { macro.events.reduce((chain, data) => chain.then(() => tauriInvoke?.('write_terminal', { id: terminalId, data })), Promise.resolve()).catch(() => {}); };
  const broadcast = async (ids: string[], data: string): Promise<Record<string, 'sent' | 'failed'>> => {
    const results = await Promise.all(ids.map(async id => { try { await tauriInvoke?.('write_terminal', { id, data }); return [id, 'sent'] as const; } catch { return [id, 'failed'] as const; } }));
    return Object.fromEntries(results) as Record<string, 'sent' | 'failed'>;
  };
  const active = tabs.find(tab => tab.id === activeId);
  const split = tabs.find(tab => tab.id === splitId && tab.id !== activeId);
  const duplicateActive = () => {
    if (!active) return;
    const base = `${active.session.name} (copy)`;
    let name = base;
    let suffix = 2;
    while (tabs.some(tab => tab.session.name === name && tab.session.session_type === active.session.session_type)) name = `${base} ${suffix++}`;
    const copy: Tab = { id: `tab-${Date.now()}-${tabs.length}`, session: { ...active.session, name }, state: 'starting' };
    setTabs(current => [...current, copy]);
    setActiveId(copy.id);
  };
  const showNotice = (message: string) => { setNotice(message); setEditorSession(undefined); };
  const openTools = () => { setNotice(undefined); setPanel('tools'); };
  const openView = () => { if (active) splitWorkspace(); else showNotice('Open a terminal before using View or Split.'); };
  const openTunnel = () => { setNotice(undefined); setPanel('tunnel'); };
  const openHelp = () => showNotice('Shortcuts: Enter executes terminal input, R reconnects, S resumes, and the toolbar opens Sessions, Split, Duplicate, MultiExec, Packages, and Settings.');
  const openXserver = async () => {
    try { showNotice(await tauriInvoke<string>('xserver_status')); }
    catch (error) { showNotice(`X server status failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  return <div className="react-app-shell">
    <div className="react-menu-row"><strong>Moraxterm</strong><button onClick={() => showNotice('Use Session or Start local terminal to open a terminal.')}>Terminal</button><button onClick={() => { setTabs([]); setPanel(undefined); }}>Sessions</button><button onClick={openView}>View</button><button onClick={openXserver}>X server</button><button onClick={openTools}>Tools</button><button onClick={() => setPanel('settings')}>Settings</button><button onClick={() => setPanel('macros')}>Macros</button><button onClick={openHelp}>Help</button></div>
    <Toolbar onNewShell={() => openSession({ name: 'Local Shell', session_type: 'Unix', host: '', username: '', port: 0, unix_shell: 'fish' })} onHome={() => { setActiveId(undefined); setEditorSession(undefined); setPanel(undefined); }} onEdit={() => { if (active) setEditorSession(active.session); else if (sessions[0]) setEditorSession(sessions[0]); }} onSettings={() => setPanel('settings')} onMacros={() => setPanel('macros')} onMultiExec={() => setPanel('multiexec')} onSftp={() => setPanel('sftp')} onSplit={splitWorkspace} onDuplicate={duplicateActive} onTools={openTools} onView={openView} onTunnel={openTunnel} onHelp={openHelp} onXserver={openXserver} />
    {notice && <div className="react-action-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice(undefined)}>×</button></div>}
    <main className="react-main"><nav className="react-rail"><button className="active" onClick={() => setActiveId(undefined)} title="Home">★</button><button onClick={openTools} title="Tools">⚒</button><button onClick={openTunnel} title="Tunneling">➤</button><button onClick={openView} title="View">◆</button></nav><SessionSidebar sessions={sessions} activeId={active?.session.name} onOpen={openSession} onHome={() => setActiveId(undefined)} onEdit={setEditorSession} onTools={openTools} onMacros={() => setPanel('macros')} onNotice={showNotice} />
      <section className="react-workspace">
        {editorSession ? <SessionEditor session={editorSession} onSave={saveSession} onCancel={() => setEditorSession(undefined)} /> : panel === 'settings' ? <Settings value={uiSettings} onSave={saveSettings} onCancel={() => setPanel(undefined)} /> : panel === 'macros' ? <MacroManager activeTerminalId={active?.id} onPlay={playMacro} onClose={() => setPanel(undefined)} /> : panel === 'multiexec' ? <MultiExecManager targets={tabs.map(tab => ({ id: tab.id, name: tab.session.name, type: tab.session.session_type, state: tab.state }))} onBroadcast={broadcast} onClose={() => setPanel(undefined)} /> : panel === 'tunnel' ? <TunnelManager onClose={() => setPanel(undefined)} /> : panel === 'tools' ? <ToolsPanel onClose={() => setPanel(undefined)} /> : panel === 'sftp' ? <SftpPane session={active?.session || sessions.find(item => item.session_type === 'SSH')} onClose={() => setPanel(undefined)} /> : !tabs.length || !active ? <div className="react-home"><div className="react-home-mark">▣</div><h1>Moraxterm</h1><p>Your terminal workspace</p><div><button className="primary" onClick={() => openSession({ name: 'Local Shell', session_type: 'Unix', host: '', username: '', port: 0, unix_shell: 'fish' })}>＋ Start local terminal</button><button onClick={() => setActiveId(undefined)}>↻ Recover previous sessions</button></div><input aria-label="Find existing session or server name" placeholder="Find existing session or server name..." /><h2>Recent sessions</h2><div className="react-recent">{sessions.slice(0, 6).map(session => <button key={session.name} onClick={() => openSession(session)}><ProtocolIcon type={session.session_type} /><span>{session.name}<small>{session.host || session.session_type}</small></span></button>)}</div></div> : <>
          <nav className="react-tabs">{tabs.map(tab => <button key={tab.id} className={tab.id === activeId ? 'active' : ''} onClick={() => setActiveId(tab.id)}><ProtocolIcon type={tab.session.session_type} />{tab.session.name}<span className={`dot ${tab.state}`} /><b onClick={event => { event.stopPropagation(); closeTab(tab.id); }}>×</b></button>)}</nav>
          <div className={split ? 'react-panes react-panes-split' : 'react-panes'}>{active && <div className="react-pane-slot"><TerminalPane key={active.id} tab={active} settings={uiSettings} onClose={() => closeTab(active.id)} onError={error => setTabs(current => current.map(item => item.id === active.id ? { ...item, error } : item))} onState={state => setTabs(current => current.map(item => item.id === active.id ? { ...item, state, ...(state === 'starting' ? { error: undefined } : {}) } : item))} /></div>}{split && <><div className="react-pane-divider" aria-hidden="true" /><div className="react-pane-slot"><TerminalPane key={split.id} tab={split} settings={uiSettings} onClose={() => closeTab(split.id)} onError={error => setTabs(current => current.map(item => item.id === split.id ? { ...item, error } : item))} onState={state => setTabs(current => current.map(item => item.id === split.id ? { ...item, state, ...(state === 'starting' ? { error: undefined } : {}) } : item))} /></div></>}</div>
        </>}
        <footer className="react-status"><span>● Ready</span><span>CPU —</span><span>RAM —</span><span>Network —</span><span>Desktop</span></footer>
      </section>
    </main>
  </div>;
}
