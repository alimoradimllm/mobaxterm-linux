import { useEffect, useState } from 'react';
import { Session, tauriInvoke } from './react-types';

interface SftpPaneProps { session?: Session; onClose: () => void; }

function parseRows(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export default function SftpPane({ session, onClose }: SftpPaneProps) {
  const host = session?.host || '';
  const username = session?.username || '';
  const port = session?.port || 22;
  const [path, setPath] = useState(session?.working_directory || '~');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [operationPath, setOperationPath] = useState('');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState('0644');

  useEffect(() => { setPath(session?.working_directory || '~'); }, [session?.name, session?.working_directory]);
  const rows = parseRows(output);
  const request = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setStatus('Working…');
    try { const result = await action(); setOutput(String(result || '')); setStatus(success); }
    catch (error) { setStatus(`Failed: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const invoke = (command: string, args: Record<string, unknown>) => tauriInvoke ? tauriInvoke(command, args) : Promise.reject('Tauri bridge unavailable');
  const list = () => request(() => invoke('sftp_list', { host, username, port, path }), `Listed ${path}`);
  const operate = (operation: string) => request(() => invoke('sftp_operation', { host, username, port, operation, path: operationPath, target, mode }), `${operation} completed`);
  const transfer = (direction: 'upload' | 'download') => request(() => invoke('sftp_transfer', { host, username, port, direction, localPath: operationPath, remotePath: target || path }), `${direction} requested`);

  return <section className="react-sftp-pane">
    <header className="react-sftp-header"><div><strong>SFTP / FTP Browser</strong><small>{session ? `${username}@${host}:${port}` : 'No active session'}</small></div><button onClick={onClose}>Close</button></header>
    <div className="react-sftp-path"><label>Remote path<input value={path} onChange={event => setPath(event.target.value)} /></label><button disabled={busy || !host || !username} onClick={list}>Refresh</button></div>
    <div className="react-sftp-body"><div className="react-sftp-list"><h3>Remote directory</h3>{rows.length ? rows.map((row, index) => <div className="react-sftp-row" key={`${index}-${row}`}>{row}</div>) : <p className="react-sftp-empty">No listing loaded.</p>}</div>
      <div className="react-sftp-actions"><h3>Operations</h3><label>Path<input value={operationPath} onChange={event => setOperationPath(event.target.value)} placeholder="/remote/file" /></label><label>Target<input value={target} onChange={event => setTarget(event.target.value)} placeholder="/remote/target or local file" /></label><label>Mode<input value={mode} onChange={event => setMode(event.target.value)} /></label><div className="react-sftp-buttons"><button disabled={busy || !host} onClick={() => operate('mkdir')}>New folder</button><button disabled={busy || !host} onClick={() => operate('rename')}>Rename</button><button disabled={busy || !host} onClick={() => operate('delete')}>Delete</button><button disabled={busy || !host} onClick={() => operate('chmod')}>Permissions</button><button disabled={busy || !host} onClick={() => transfer('upload')}>Upload</button><button disabled={busy || !host} onClick={() => transfer('download')}>Download</button></div></div>
    </div><footer className="react-sftp-footer"><span>{status}</span><span>{rows.length} lines</span></footer>
  </section>;
}
