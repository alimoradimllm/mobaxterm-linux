import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';

const invoke = window.__TAURI__?.core?.invoke;
const app = document.querySelector('#app');
app.innerHTML = `
<header class="titlebar"><span class="brand">Moraxterm</span><nav class="menus"><button data-action="new-shell">Terminal</button><button data-action="sessions">Sessions</button><button data-action="view">View</button><button data-action="xserver">X server</button><button data-action="tools">Tools</button><button data-action="settings">Settings</button><button data-action="macros">Macros</button><button data-action="help">Help</button></nav><div class="window-actions">— □ ×</div></header>
<div class="toolbar"><button class="tool primary" data-action="new-shell">▣<small>Session</small></button><button class="tool" data-action="load-sessions">★<small>Sessions</small></button><button class="tool" data-action="split">▤<small>Split</small></button><button class="tool" data-action="multiexec">⇄<small>MultiExec</small></button><button class="tool" data-action="tunnel">⌁<small>Tunneling</small></button><button class="tool" data-action="packages">▣<small>Packages</small></button><span class="toolbar-spacer"></span><button class="tool" data-action="settings">⚙<small>Settings</small></button></div>
<div class="quick"><input id="quick" placeholder="Quick connect..."/><button id="connect">Connect</button></div>
<main><aside class="sidebar"><div class="side-tabs"><button class="selected">Sessions</button><button data-action="tools">Tools</button><button data-action="macros">Macros</button></div><div class="side-search"><input id="search" placeholder="Search sessions"/></div><div class="tree-header">▾ Saved sessions <button id="reload" title="Reload SQLite sessions">↻</button></div><ul id="sessions"></ul><div class="side-footer">▣ Remote monitoring<br/><label><input type="checkbox" checked/> Follow terminal folder</label></div></aside>
<section class="workspace"><nav id="tabs" class="tabs"></nav><div id="panes" class="panes"></div><footer class="status"><span id="status-message">● Loading sessions</span><span>CPU —</span><span>RAM —</span><span>Network —</span><span class="status-spacer"></span><span id="platform">Desktop</span></footer></section></main>`;

const sessionsEl = document.querySelector('#sessions');
const tabsEl = document.querySelector('#tabs');
const panesEl = document.querySelector('#panes');
const statusEl = document.querySelector('#status-message');
let sessions = [];
const tabs = new Map();
const fallback = [
  { name: 'Local Shell', session_type: 'Shell', host: '' },
  { name: 'WSL-Debian', session_type: 'WSL', host: 'Debian' },
];

function status(message, error = false) {
  statusEl.textContent = `${error ? '● Error' : '●'} ${message}`;
  statusEl.style.color = error ? '#ff6b6b' : '#55d18a';
}

function iconFor(type) {
  return { SSH: '🔑', Rdp: '▣', Vnc: '◉', WSL: '▸', Shell: '⌂', Serial: '⌁' }[type] || '▸';
}

function renderSessions() {
  const query = document.querySelector('#search').value.toLowerCase().trim();
  sessionsEl.innerHTML = '';
  const groups = new Map();
  sessions.filter(s => JSON.stringify(s).toLowerCase().includes(query)).forEach(session => {
    const group = session.session_type || 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(session);
  });
  for (const [group, items] of groups) {
    const heading = document.createElement('li');
    heading.className = 'session-group';
    heading.textContent = `▾ ${group}`;
    sessionsEl.appendChild(heading);
    items.forEach(session => {
      const li = document.createElement('li');
      li.className = 'session-entry';
      li.innerHTML = `<span class="session-icon">${iconFor(session.session_type)}</span><span>${session.name}</span><small>${session.host || ''}</small>`;
      li.onclick = () => openTab(session);
      sessionsEl.appendChild(li);
    });
  }
  if (!sessions.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No saved sessions. Import or create one.';
    sessionsEl.appendChild(empty);
  }
}

async function loadSessions() {
  try {
    const loaded = invoke ? await invoke('list_sessions') : [];
    sessions = Array.isArray(loaded) && loaded.length ? loaded : fallback;
    status(`Loaded ${sessions.length} sessions`);
  } catch (error) {
    sessions = fallback;
    status(`Using local defaults: ${error}`, true);
  }
  renderSessions();
}

function openTab(session) {
  const id = `tab-${Date.now()}-${tabs.size}`;
  const button = document.createElement('button');
  button.dataset.id = id;
  button.innerHTML = `<span class="tab-icon">${iconFor(session.session_type)}</span>${session.name}<b>×</b>`;
  button.onclick = () => activate(id);
  tabsEl.appendChild(button);
  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.dataset.id = id;
  const terminalHost = document.createElement('div');
  terminalHost.className = 'terminal-host';
  pane.appendChild(terminalHost);
  panesEl.appendChild(pane);
  const terminal = new Terminal({ convertEol: true, cursorBlink: true, fontSize: 13, theme: { background: '#101113', foreground: '#d7d7d7', cursor: '#00d084', black: '#101113', green: '#00d084', cyan: '#00c8d7', blue: '#4d9cff', yellow: '#e6d85a', red: '#ff5c57' } });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(terminalHost);
  fit.fit();
  terminal.writeln(`\x1b[36mMoraxterm\x1b[0m — ${session.session_type} ${session.host || ''}`);
  terminal.writeln('Ready. Type a command and press Enter.');
  terminal.write('\r\n$ ');
  let line = '';
  terminal.onData(async data => {
    if (data === '\r') {
      terminal.write('\r\n');
      if (line.trim() && invoke) {
        try {
          const out = await invoke('run_terminal_command', { command: line });
          terminal.write(out.replaceAll('\n', '\r\n'));
        } catch (error) {
          terminal.write(`\r\n\x1b[31m${error}\x1b[0m`);
        }
      }
      line = '';
      terminal.write('\r\n$ ');
    } else if (data === '\u007f') {
      if (line) { line = line.slice(0, -1); terminal.write('\b \b'); }
    } else if (data >= ' ') {
      line += data;
      terminal.write(data);
    }
  });
  tabs.set(id, { pane, terminal, fit });
  button.querySelector('b').onclick = event => {
    event.stopPropagation();
    tabs.get(id).terminal.dispose();
    pane.remove();
    button.remove();
    tabs.delete(id);
  };
  activate(id);
}

function activate(id) {
  document.querySelectorAll('[data-id]').forEach(element => element.classList.toggle('active', element.dataset.id === id));
  const tab = tabs.get(id);
  if (tab) tab.fit.fit();
}

function activeTab() {
  return [...tabs.entries()].find(([, tab]) => tab.pane.classList.contains('active'))?.[0];
}

function closeActiveTab() {
  const id = activeTab();
  if (!id) return;
  const button = tabsEl.querySelector(`[data-id="${id}"]`);
  button?.querySelector('b')?.click();
}

function actionMessage(action) {
  const messages = { view: 'View controls are ready for terminal and pane settings.', xserver: 'X server integration is queued in the compatibility roadmap.', tools: 'Tools are queued for the network-tools phase.', settings: 'Settings editor is queued for the session-manager phase.', macros: 'Macro recording is queued for the macros phase.', split: 'Split panes are the next terminal-layout milestone.', multiexec: 'MultiExec will broadcast commands to selected tabs.', tunnel: 'Tunnel manager is queued for the SSH forwarding phase.', packages: 'Package tools will be connected to the active terminal.' };
  status(messages[action] || 'Moraxterm');
}

document.querySelector('#search').oninput = renderSessions;
document.querySelector('#reload').onclick = loadSessions;
document.querySelector('#connect').onclick = () => {
  const host = document.querySelector('#quick').value.trim();
  if (host) openTab({ name: host, session_type: 'SSH', host });
};
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => {
  const action = button.dataset.action;
  if (action === 'new-shell') openTab({ name: 'Local Shell', session_type: 'Shell', host: '' });
  else if (action === 'load-sessions' || action === 'sessions') loadSessions();
  else actionMessage(action);
});
document.addEventListener('keydown', event => {
  if (!event.ctrlKey) return;
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); openTab({ name: 'Local Shell', session_type: 'Shell', host: '' }); }
  if (event.key.toLowerCase() === 'w') { event.preventDefault(); closeActiveTab(); }
  if (event.key.toLowerCase() === 'l') { event.preventDefault(); document.querySelector('#quick').focus(); }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); document.querySelector('#search').focus(); }
});
loadSessions();
