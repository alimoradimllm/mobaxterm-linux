import { useEffect, useState } from 'react';

export interface Macro { name: string; events: string[]; }
interface MacroManagerProps { activeTerminalId?: string; onPlay: (macro: Macro, terminalId: string) => void; onClose: () => void; }
const storageKey = 'moraxterm-macro-library';
function loadMacros(): Macro[] { try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.name === 'string' && Array.isArray(item.events)).slice(0, 50) : []; } catch { return []; } }
function saveMacros(macros: Macro[]) { localStorage.setItem(storageKey, JSON.stringify(macros.slice(0, 50))); }

export default function MacroManager({ activeTerminalId, onPlay, onClose }: MacroManagerProps) {
  const [macros, setMacros] = useState<Macro[]>(loadMacros);
  const [name, setName] = useState('');
  useEffect(() => saveMacros(macros), [macros]);
  const addMacro = () => { const clean = name.trim(); if (!clean) return; setMacros(current => [{ name: clean, events: [] }, ...current].slice(0, 50)); setName(''); };
  const exportMacros = () => { const blob = new Blob([JSON.stringify({ version: 1, macros }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'moraxterm-macros.json'; link.click(); URL.revokeObjectURL(link.href); };
  const importMacros = () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()); const incoming = Array.isArray(parsed) ? parsed : parsed.macros; if (!Array.isArray(incoming)) throw new Error('Expected a macros array'); const valid = incoming.filter((item): item is Macro => item && typeof item.name === 'string' && Array.isArray(item.events)); setMacros(current => [...valid, ...current].slice(0, 50)); } catch { /* invalid imports are ignored without touching existing macros */ } }; input.click(); };
  return <section className="react-editor" aria-label="Macro manager">
    <header className="react-editor-header"><div><span className="react-editor-kicker">TERMINAL AUTOMATION</span><h2>Macro Manager</h2></div><button onClick={onClose} aria-label="Close macro manager">×</button></header>
    <div className="react-macro-toolbar"><input aria-label="Macro name" placeholder="New macro name" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addMacro(); }} /><button className="primary" onClick={addMacro}>Add macro</button><button onClick={importMacros}>Import</button><button onClick={exportMacros}>Export</button></div>
    <div className="react-macro-list">{macros.map((macro, index) => <article className="react-macro-row" key={`${macro.name}-${index}`}><div><strong>{macro.name}</strong><small>{macro.events.length} input events</small></div><button disabled={!activeTerminalId} title={activeTerminalId ? 'Play on active terminal' : 'Open a terminal first'} onClick={() => activeTerminalId && onPlay(macro, activeTerminalId)}>Play</button><button onClick={() => setMacros(current => current.filter((_, itemIndex) => itemIndex !== index))}>Delete</button></article>)}{!macros.length && <p className="react-empty">No saved macros. Add a macro name or import a macro library.</p>}</div>
    <footer className="react-editor-footer"><span className="react-macro-limit">Maximum 50 macros</span><button onClick={onClose}>Done</button></footer>
  </section>;
}
