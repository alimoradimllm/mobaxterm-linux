import { useEffect, useState } from 'react';
import type { Session, SessionType } from './react-types';

interface SessionEditorProps {
  session: Session;
  onSave: (session: Session) => void;
  onCancel: () => void;
}

const protocols: SessionType[] = ['SSH', 'Telnet', 'Rdp', 'Vnc', 'WSL', 'Shell', 'Serial'];

export default function SessionEditor({ session, onSave, onCancel }: SessionEditorProps) {
  const [draft, setDraft] = useState<Session>(session);
  const [tab, setTab] = useState<'Basic' | 'SSH' | 'Terminal'>('Basic');
  useEffect(() => setDraft(session), [session]);
  const update = <K extends keyof Session>(key: K, value: Session[K]) => setDraft(current => ({ ...current, [key]: value }));
  const isSsh = draft.session_type === 'SSH';
  return <section className="react-editor" aria-label="Session editor">
    <header className="react-editor-header"><div><span className="react-editor-kicker">SESSION EDITOR</span><h2>{draft.name || 'New session'}</h2></div><button onClick={onCancel} aria-label="Close session editor">×</button></header>
    <div className="react-editor-protocols">{protocols.map(protocol => <button key={protocol} className={draft.session_type === protocol ? 'selected' : ''} onClick={() => update('session_type', protocol)}>{protocol}</button>)}</div>
    <nav className="react-editor-tabs">{(['Basic', 'SSH', 'Terminal'] as const).map(name => <button key={name} className={tab === name ? 'selected' : ''} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <div className="react-editor-form">
      {tab === 'Basic' && <>
        <label>Session name<input value={draft.name} onChange={event => update('name', event.target.value)} /></label>
        <div className="react-editor-grid"><label>Host<input value={draft.host ?? ''} onChange={event => update('host', event.target.value || undefined)} /></label><label>Port<input type="number" min="1" max="65535" value={draft.port ?? (isSsh ? 22 : '')} onChange={event => update('port', event.target.value ? Number(event.target.value) : undefined)} /></label></div>
        <label>Username<input value={draft.username ?? ''} onChange={event => update('username', event.target.value || undefined)} autoComplete="off" /></label>
        <label>Folder<input value={draft.folder ?? ''} onChange={event => update('folder', event.target.value || undefined)} placeholder="User sessions" /></label>
      </>}
      {tab === 'SSH' && <>
        <div className="react-editor-note">SSH compatibility settings are stored as typed session metadata and passed to the existing Rust bridge.</div>
        <label>Remote shell<select value={draft.remote_shell ?? ''} onChange={event => update('remote_shell', event.target.value || undefined)}><option value="">Server default</option><option value="bash">Bash</option><option value="fish">Fish</option><option value="zsh">Zsh</option><option value="sh">POSIX sh</option></select></label>
        <label className="react-check"><input type="checkbox" checked={draft.ssh_agent_forwarding ?? false} onChange={event => update('ssh_agent_forwarding', event.target.checked)} /> Enable SSH-agent forwarding</label>
      </>}
      {tab === 'Terminal' && <>
        <label>Local shell<select value={draft.shell ?? ''} onChange={event => update('shell', event.target.value || undefined)}><option value="">System default</option><option value="cmd">Command Prompt</option><option value="powershell">PowerShell</option><option value="bash">Bash</option></select></label>
        <div className="react-editor-note">Terminal input preserves Moraxterm behavior: selection copies automatically and right-click pastes.</div>
      </>}
    </div>
    <footer className="react-editor-footer"><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onSave(draft)}>Save session</button></footer>
  </section>;
}
