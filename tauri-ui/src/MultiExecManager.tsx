import { useMemo, useState } from 'react';

export interface MultiExecTarget { id: string; name: string; type: string; state: string; }
interface MultiExecProps { targets: MultiExecTarget[]; onBroadcast: (ids: string[], data: string) => Promise<Record<string, 'sent' | 'failed'>>; onClose: () => void; }

export default function MultiExecManager({ targets, onBroadcast, onClose }: MultiExecProps) {
  const activeTargets = useMemo(() => targets.filter(target => target.state !== 'exited'), [targets]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activeTargets.map(target => target.id)));
  const [data, setData] = useState('');
  const [status, setStatus] = useState<Record<string, 'sent' | 'failed'>>({});
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const broadcast = async () => { if (!data || !selected.size) return; setStatus({}); setStatus(await onBroadcast([...selected], data)); };
  return <section className="react-editor" aria-label="MultiExec manager">
    <header className="react-editor-header"><div><span className="react-editor-kicker">SYNCHRONIZED TERMINALS</span><h2>MultiExec targets</h2></div><button onClick={onClose} aria-label="Close MultiExec">×</button></header>
    <div className="react-multiexec-banner"><strong>Commands will be sent to selected terminals</strong><span>{selected.size} selected</span></div>
    <div className="react-multiexec-layout"><div className="react-multiexec-targets">{activeTargets.map(target => <label className="react-multiexec-row" key={target.id}><input type="checkbox" checked={selected.has(target.id)} onChange={() => toggle(target.id)} /><span><strong>{target.name}</strong><small>{target.type} · {target.state}</small></span><em className={status[target.id] || ''}>{status[target.id] === 'sent' ? '✓ sent' : status[target.id] === 'failed' ? '× failed' : ''}</em></label>)}{!activeTargets.length && <p className="react-empty">Open at least one terminal to use MultiExec.</p>}</div><div className="react-multiexec-compose"><label>Command or input<textarea value={data} onChange={event => setData(event.target.value)} placeholder="Type a command to send to selected terminals..." /></label><div className="react-editor-note">Multi-paste preserves the selected target set. Terminals in failed or exited state are not sent input.</div><button className="primary react-broadcast" disabled={!data || !selected.size} onClick={broadcast}>⇄ Send to selected</button></div></div>
    <footer className="react-editor-footer"><button onClick={() => setSelected(new Set(activeTargets.map(target => target.id)))}>Select all active</button><button onClick={() => setSelected(new Set())}>Clear</button><button onClick={onClose}>Done</button></footer>
  </section>;
}
