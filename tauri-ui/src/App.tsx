import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { iconFor } from './icons.js';
import SessionEditor from './SessionEditor';
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
}

const remoteTypes = new Set(['SSH', 'TELNET', 'RDP', 'Rdp', 'VNC', 'Vnc', 'WSL', 'Serial']);

function Toolbar({ onNewShell, onHome, onEdit }: { onNewShell: () => void; onHome: () => void; onEdit: () => void }) {
  const items = [
    ['▣', 'Session', onNewShell], ['✣', 'Servers', onHome], ['⚒', 'Tools', undefined],
    ['★', 'Sessions', onEdit], ['▣', 'View', undefined], ['▤', 'Split', undefined],
    ['⧉', 'Duplicate', undefined], ['⇄', 'MultiExec', undefined], ['⇆', 'Tunneling', undefined],
    ['⇅', 'Packages', undefined], ['⚙', 'Settings', undefined], ['?', 'Help', undefined],
  ] as const;
  return <div className="react-toolbar">
    {items.map(([symbol, label, action]) => <button key={label} className={label === 'Session' ? 'react-tool primary' : 'react-tool'} onClick={action} title={label}>
      <span aria-hidden="true">{symbol}</span><small>{label}</small>
    </button>)}
    <span className="react-toolbar-spacer" />
    <button className="react-tool" title="X server"><span>⚔</span><small>X server</small></button>
    <button className="react-tool" title="Exit" onClick={() => window.close()}><span>⏻</span><small>Exit</small></button>
  </div>;
}

function ProtocolIcon({ type }: { type: string }) {
  return <span className="react-protocol-icon" dangerouslySetInnerHTML={{ __html: iconFor(type) }} />;
}

function SessionSidebar({ sessions, activeId, onOpen, onHome, onEdit }: {
  sessions: Session[]; activeId?: string; onOpen: (session: Session) => void; onHome: () => void; onEdit: (session: Session) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => sessions.filter(session => JSON.stringify(session).toLowerCase().includes(query.toLowerCase())), [sessions, query]);
  const grouped = useMemo(() => visible.reduce<Record<string, Session[]>>((groups, session) => {
    const key = session.folder || session.session_type || 'Other';
    (groups[key] ||= []).push(session);
    return groups;
  }, {}), [visible]);
  return <aside className="react-sidebar">
    <div className="react-side-tabs"><button className="selected" onClick={onHome}>Sessions</button><button>Tools</button><button>Macros</button></div>
    <div className="react-side-search"><input aria-label="Quick find sessions" placeholder="Quick find sessions" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="react-tree-header"><strong>★ User sessions</strong><button title="New folder">📁＋</button><button title="Edit selected session" onClick={() => { const selected = sessions.find(session => session.name === activeId); if (selected) onEdit(selected); }}>✎</button><button title="Refresh sessions" onClick={onHome}>↻</button></div>
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

function TerminalPane({ tab, onState }: { tab: Tab; onState: (state: Tab['state']) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 14,
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
    tauriInvoke?.('start_terminal', { id, session, program: null }).then(() => onState('connected')).catch(() => onState('failed'));
    return () => {
      resize.dispose(); data.dispose(); selection.dispose();
      hostRef.current?.removeEventListener('contextmenu', context);
      Promise.resolve(unlistenPromise).then(unlisten => unlisten?.());
      Promise.resolve(exitPromise).then(unlisten => unlisten?.());
      tauriInvoke?.('close_terminal', { id }).catch(() => {});
      terminal.dispose();
    };
  }, [tab.id, tab.session, onState]);
  return <div className="react-terminal-pane">
    <div className="react-pane-bar"><span><ProtocolIcon type={tab.session.session_type} /> {tab.session.name}</span><span className={`react-state ${tab.state}`}>{tab.state}</span></div>
    <div className="react-terminal-host" ref={hostRef} />
  </div>;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(fallbackSessions);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [editorSession, setEditorSession] = useState<Session>();
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
  const openQuick = () => {
    const host = quick.trim();
    if (host) openSession({ name: host, host, session_type: 'SSH', port: 22 });
  };
  const saveSession = (session: Session) => {
    setSessions(current => [...current.filter(item => !(item.name === session.name && item.session_type === session.session_type)), session]);
    tauriInvoke?.('save_session', { session }).catch(() => {});
    setEditorSession(undefined);
  };
  const active = tabs.find(tab => tab.id === activeId);
  return <div className="react-app-shell">
    <div className="react-menu-row"><strong>Moraxterm</strong><button>Terminal</button><button onClick={() => setTabs([])}>Sessions</button><button>View</button><button>X server</button><button>Tools</button><button>Settings</button><button>Macros</button><button>Help</button></div>
    <Toolbar onNewShell={() => openSession({ name: 'Local Shell', session_type: 'Shell' })} onHome={() => { setActiveId(undefined); setEditorSession(undefined); }} onEdit={() => { if (active) setEditorSession(active.session); else if (sessions[0]) setEditorSession(sessions[0]); }} />
    <div className="react-quick-connect"><input aria-label="Quick connect" placeholder="Quick connect..." value={quick} onChange={event => setQuick(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') openQuick(); }} /><button onClick={openQuick}>Connect</button></div>
    <main className="react-main"><nav className="react-rail"><button className="active">★</button><button>⚒</button><button>➤</button><button>◆</button></nav><SessionSidebar sessions={sessions} activeId={active?.session.name} onOpen={openSession} onHome={() => setActiveId(undefined)} onEdit={setEditorSession} />
      <section className="react-workspace">
        {editorSession ? <SessionEditor session={editorSession} onSave={saveSession} onCancel={() => setEditorSession(undefined)} /> : !tabs.length || !active ? <div className="react-home"><div className="react-home-mark">▣</div><h1>Moraxterm</h1><p>Your terminal workspace</p><div><button className="primary" onClick={() => openSession({ name: 'Local Shell', session_type: 'Shell' })}>＋ Start local terminal</button><button onClick={() => setActiveId(undefined)}>↻ Recover previous sessions</button></div><input aria-label="Find existing session or server name" placeholder="Find existing session or server name..." /><h2>Recent sessions</h2><div className="react-recent">{sessions.slice(0, 6).map(session => <button key={session.name} onClick={() => openSession(session)}><ProtocolIcon type={session.session_type} /><span>{session.name}<small>{session.host || session.session_type}</small></span></button>)}</div></div> : <>
          <nav className="react-tabs">{tabs.map(tab => <button key={tab.id} className={tab.id === activeId ? 'active' : ''} onClick={() => setActiveId(tab.id)}><ProtocolIcon type={tab.session.session_type} />{tab.session.name}<span className={`dot ${tab.state}`} /><b onClick={event => { event.stopPropagation(); tauriInvoke?.('close_terminal', { id: tab.id }).catch(() => {}); setTabs(current => current.filter(item => item.id !== tab.id)); setActiveId(tabs.find(item => item.id !== tab.id)?.id); }}>×</b></button>)}</nav>
          <div className="react-panes">{active && <TerminalPane key={active.id} tab={active} onState={state => setTabs(current => current.map(item => item.id === active.id ? { ...item, state } : item))} />}</div>
        </>}
        <footer className="react-status"><span>● Ready</span><span>CPU —</span><span>RAM —</span><span>Network —</span><span>Desktop</span></footer>
      </section>
    </main>
  </div>;
}
