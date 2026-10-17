import { useState } from 'react';
import { tauriInvoke } from './react-types';

interface TunnelManagerProps { onClose: () => void; }

type TunnelMode = 'local' | 'remote' | 'dynamic';

export default function TunnelManager({ onClose }: TunnelManagerProps) {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [mode, setMode] = useState<TunnelMode>('local');
  const [bind, setBind] = useState('127.0.0.1:8080');
  const [target, setTarget] = useState('127.0.0.1:80');
  const [tunnelId, setTunnelId] = useState<string>();
  const [status, setStatus] = useState('Ready');

  const start = async () => {
    setStatus('Starting tunnel...');
    try {
      const id = await tauriInvoke<string>('start_tunnel', { host, username, sshPort, mode, bind, target });
      setTunnelId(id);
      setStatus(`Running: ${id}`);
    } catch (error) {
      setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const stop = async () => {
    if (!tunnelId) return;
    try {
      await tauriInvoke('stop_tunnel', { id: tunnelId });
      setTunnelId(undefined);
      setStatus('Stopped');
    } catch (error) {
      setStatus(`Stop failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return <section className="react-editor" aria-label="Tunneling manager">
    <header className="react-editor-header"><div><span className="react-editor-kicker">SSH PORT FORWARDING</span><h2>Tunneling</h2></div><button onClick={onClose} aria-label="Close tunneling">×</button></header>
    <div className="react-editor-form">
      <label>SSH host<input value={host} onChange={event => setHost(event.target.value)} placeholder="server.example.com" /></label>
      <div className="react-editor-grid"><label>Username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="Optional" /></label><label>SSH port<input type="number" min="1" max="65535" value={sshPort} onChange={event => setSshPort(Number(event.target.value) || 22)} /></label></div>
      <label>Mode<select value={mode} onChange={event => setMode(event.target.value as TunnelMode)}><option value="local">Local (-L)</option><option value="remote">Remote (-R)</option><option value="dynamic">Dynamic SOCKS (-D)</option></select></label>
      <label>Bind address / port<input value={bind} onChange={event => setBind(event.target.value)} placeholder="127.0.0.1:8080" /></label>
      {mode !== 'dynamic' && <label>Target address / port<input value={target} onChange={event => setTarget(event.target.value)} placeholder="127.0.0.1:80" /></label>}
      <div className="react-editor-note">Passwords and private keys are not accepted by this panel. OpenSSH handles authentication through the normal credential flow.</div>
      <div className="react-editor-note" role="status">{status}</div>
    </div>
    <footer className="react-editor-footer"><button onClick={onClose}>Close</button>{tunnelId ? <button className="primary" onClick={stop}>Stop tunnel</button> : <button className="primary" disabled={!host.trim()} onClick={start}>Start tunnel</button>}</footer>
  </section>;
}
