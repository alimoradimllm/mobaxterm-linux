import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';

const invoke = window.__TAURI__?.core?.invoke;
const listen = window.__TAURI__?.event?.listen;
const app = document.querySelector('#app');
app.innerHTML = `
<header class="titlebar"><span class="brand">Moraxterm</span><nav class="menus"><button data-action="new-shell">Terminal</button><button data-action="sessions">Sessions</button><button data-action="view">View</button><button data-action="xserver">X server</button><button data-action="tools">Tools</button><button data-action="settings">Settings</button><button data-action="macros">Macros</button><button data-action="help">Help</button></nav><div class="window-actions">— □ ×</div></header>
<div class="toolbar"><button class="tool primary" data-action="new-shell">▣<small>Session</small></button><button class="tool" data-action="load-sessions">★<small>Sessions</small></button><button class="tool" data-action="split">▤<small>Split</small></button><button class="tool" data-action="multiexec">⇄<small>MultiExec</small></button><button class="tool" data-action="tunnel">⌁<small>Tunneling</small></button><button class="tool" data-action="record">●<small>Record</small></button><button class="tool" data-action="sftp">⇅<small>SFTP</small></button><button class="tool" data-action="packages">▣<small>Packages</small></button><span class="toolbar-spacer"></span><button class="tool" data-action="settings">⚙<small>Settings</small></button></div>
<div class="quick"><input id="quick" placeholder="Quick connect..."/><button id="connect">Connect</button></div>
<main><aside class="sidebar"><div class="side-tabs"><button class="selected">Sessions</button><button data-action="tools">Tools</button><button data-action="macros">Macros</button></div><div class="side-search"><input id="search" placeholder="Search sessions"/></div><div class="tree-header">▾ Saved sessions <button id="import-backup" title="Restore backup">⇩</button><button id="export-sessions" title="Export backup">⇧</button><button id="import-sessions" title="Import INI">⇩</button><button id="new-session" title="New session">＋</button><button id="reload" title="Reload SQLite sessions">↻</button></div><ul id="sessions"></ul><div class="side-footer">▣ Remote monitoring<br/><label><input type="checkbox" checked/> Follow terminal folder</label></div></aside>
<section class="workspace"><nav id="tabs" class="tabs"></nav><div id="panes" class="panes"></div><footer class="status"><span id="status-message">● Loading sessions</span><span>CPU —</span><span>RAM —</span><span>Network —</span><span class="status-spacer"></span><span id="platform">Desktop</span></footer></section></main>`;

const sessionsEl = document.querySelector('#sessions');
const tabsEl = document.querySelector('#tabs');
const panesEl = document.querySelector('#panes');
const statusEl = document.querySelector('#status-message');
let sessions = [];
const tabs = new Map();
const tunnels = new Set();
const recordings = new Set();
let multiExec = false;
let macroRecording = false;
let macroBuffer = [];
let recentSessionNames = (() => { try { const value = JSON.parse(localStorage.getItem('moraxterm-recent-sessions') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
let terminalSettings = (() => { try { return { fontSize: 13, cursorBlink: true, theme: 'dark', ...JSON.parse(localStorage.getItem('moraxterm-settings') || '{}') }; } catch { return { fontSize: 13, cursorBlink: true, theme: 'dark' }; } })();
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

function rememberRecent(session) {
  recentSessionNames = [session.name, ...recentSessionNames.filter(name => name !== session.name)].slice(0, 8);
  localStorage.setItem('moraxterm-recent-sessions', JSON.stringify(recentSessionNames));
}

function renderSessions() {
  const query = document.querySelector('#search').value.toLowerCase().trim();
  sessionsEl.innerHTML = '';
  const groups = new Map();
  const visible = sessions.filter(s => JSON.stringify(s).toLowerCase().includes(query)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  const recent = recentSessionNames.map(name => visible.find(session => session.name === name)).filter(Boolean);
  const recentSet = new Set(recent.map(session => session.name));
  if (recent.length) groups.set('Recent', recent);
  visible.filter(session => !recentSet.has(session.name)).forEach(session => {
    const group = session.group || session.session_type || 'Other';
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
      li.innerHTML = `<button class="favorite-button" title="Toggle favorite">${session.favorite ? '★' : '☆'}</button><span class="session-icon">${iconFor(session.session_type)}</span><span>${session.name}</span><small>${session.host || ''}</small>`;
      li.querySelector('.favorite-button').onclick = async event => {
        event.stopPropagation();
        session.favorite = !session.favorite;
        if (invoke) { try { await invoke('save_session', { session }); } catch (error) { status(`Favorite update failed: ${error}`, true); } }
        renderSessions();
      };
      li.onclick = () => openTab(session);
      li.oncontextmenu = event => showSessionMenu(event, session);
      li.ondblclick = event => { event.stopPropagation(); showEditor(session); };
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

function showSessionMenu(event, session) {
  event.preventDefault();
  document.querySelector('.session-context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'session-context-menu';
  menu.innerHTML = `<button data-open>Open</button><button data-edit>Edit</button><button data-favorite>${session.favorite ? 'Remove favorite' : 'Add favorite'}</button><button data-delete>Delete</button>`;
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  document.addEventListener('click', close);
  menu.querySelector('[data-open]').onclick = () => { close(); openTab(session); };
  menu.querySelector('[data-edit]').onclick = () => { close(); showEditor(session); };
  menu.querySelector('[data-favorite]').onclick = async () => { close(); session.favorite = !session.favorite; if (invoke) await invoke('save_session', { session }); renderSessions(); };
  menu.querySelector('[data-delete]').onclick = async () => { close(); if (invoke) await invoke('delete_session', { name: session.name }); sessions = sessions.filter(item => item.name !== session.name); recentSessionNames = recentSessionNames.filter(name => name !== session.name); localStorage.setItem('moraxterm-recent-sessions', JSON.stringify(recentSessionNames)); renderSessions(); };
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

async function exportSessions() {
  if (!invoke) { status('Export is available in the native Tauri app', true); return; }
  const path = (window.prompt('Backup JSON path:', `moraxterm-sessions-${Date.now()}.json`) || '').trim();
  if (!path) return;
  try { const count = await invoke('export_sessions', { path }); status(`Exported ${count} sanitized sessions`); }
  catch (error) { status(`Export failed: ${error}`, true); }
}

async function importBackup() {
  if (!invoke) { status('Restore is available in the native Tauri app', true); return; }
  const path = (window.prompt('Backup JSON path to restore:') || '').trim();
  if (!path) return;
  try { const count = await invoke('import_backup', { path }); await loadSessions(); status(`Restored ${count} sanitized sessions`); }
  catch (error) { status(`Restore failed: ${error}`, true); }
}

async function importSessions() {
  if (!invoke) { status('Import is available in the native Tauri app', true); return; }
  const path = window.prompt('Path to a sanitized INI export:', 'MobaXterm.ini');
  if (!path) return;
  try {
    const count = await invoke('import_sessions', { path });
    await loadSessions();
    status(`Imported ${count} sessions`);
  } catch (error) { status(`Import failed: ${error}`, true); }
}

function showEditor(session = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<form class="session-editor"><h2>${session.name ? 'Edit session' : 'New session'}</h2><label>Name<input name="name" required value="${session.name || ''}"></label><label>Type<select name="session_type"><option>SSH</option><option>Rdp</option><option>Vnc</option><option>WSL</option><option>Shell</option><option>Telnet</option><option>Serial</option></select></label><label>Host<input name="host" value="${session.host || ''}"></label><label>Username<input name="username" value="${session.username || ''}"></label><label>Port<input name="port" type="number" min="0" max="65535" value="${session.port || 22}"></label><label>Environment (non-secret KEY=VALUE, one per line)<textarea name="environment" rows="3">${Object.entries(session.environment || {}).map(([key, value]) => `${key}=${value}`).join('\\n')}</textarea></label><label>Startup command (non-secret)<input name="startup_command" value="${session.startup_command || ''}"></label><label>Bookmark group<input name="group" value="${session.group || ''}"></label><label><input name="favorite" type="checkbox" ${session.favorite ? 'checked' : ''}> Favorite</label><div class="editor-actions"><button type="button" data-cancel>Cancel</button>${session.name ? '<button type="button" data-delete>Delete</button>' : ''}<button type="submit">Save</button></div></form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  form.session_type.value = session.session_type || 'SSH';
  overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
  overlay.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (invoke) await invoke('delete_session', { name: session.name });
    overlay.remove();
    await loadSessions();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    const environment = Object.fromEntries(String(values.get('environment') || '').split('\\n').map(line => line.trim()).filter(line => line && line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1)]; }));
    const record = { name: values.get('name'), session_type: values.get('session_type'), host: values.get('host') || '', username: values.get('username') || '', port: Number(values.get('port') || 0), environment, startup_command: values.get('startup_command') || '', group: values.get('group') || '', favorite: form.favorite.checked };
    try {
      if (invoke) await invoke('save_session', { session: record });
      overlay.remove();
      await loadSessions();
      status(`Saved ${record.name}`);
    } catch (error) { status(`Save failed: ${error}`, true); }
  };
}

function terminalTheme() {
  if (terminalSettings.theme === 'amber') return { background: '#17120a', foreground: '#ffd27a', cursor: '#ffb000', black: '#17120a', green: '#d9b44a', cyan: '#e0b35a', blue: '#d99a3e', yellow: '#ffe08a', red: '#ff7657' };
  return { background: '#101113', foreground: '#d7d7d7', cursor: '#00d084', black: '#101113', green: '#00d084', cyan: '#00c8d7', blue: '#4d9cff', yellow: '#e6d85a', red: '#ff5c57' };
}

function launchTerminal(id, session) {
  if (!invoke) return;
  invoke('start_terminal', { id, session: ['SSH', 'RDP', 'Rdp', 'VNC', 'Vnc', 'WSL', 'Telnet', 'Serial'].includes(session.session_type) ? session : null, program: null }).catch(error => status(`Terminal start failed: ${error}`, true));
}

function resumeTab(id) {
  if (!invoke) return;
  invoke('resume_terminal', { id }).then(() => status(`Terminal ${id} resumed`)).catch(error => status(`Terminal resume failed: ${error}`, true));
}

function reconnectTab(id) {
  const tab = tabs.get(id);
  if (!tab || !invoke) return;
  tab.exited = false;
  tab.terminal.options.disableStdin = false;
  tab.terminal.writeln('\\r\\n\\x1b[36m[reconnecting...]\\x1b[0m');
  launchTerminal(id, tab.session);
}

function openTab(session) {
  rememberRecent(session);
  const id = `tab-${Date.now()}-${tabs.size}`;
  const button = document.createElement('button');
  button.dataset.id = id;
  button.innerHTML = `<span class="tab-icon">${iconFor(session.session_type)}</span>${session.name}<em title="Resume suspended process">▶</em><i title="Reconnect">↻</i><b>×</b>`;
  button.onclick = () => activate(id);
  tabsEl.appendChild(button);
  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.dataset.id = id;
  const terminalHost = document.createElement('div');
  terminalHost.className = 'terminal-host';
  pane.appendChild(terminalHost);
  panesEl.appendChild(pane);
  const terminal = new Terminal({ convertEol: true, cursorBlink: terminalSettings.cursorBlink, fontSize: Number(terminalSettings.fontSize) || 13, theme: terminalTheme() });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(terminalHost);
  fit.fit();
  terminal.onResize(({ cols, rows }) => {
    if (invoke) invoke('resize_terminal', { id, cols, rows }).catch(error => status(`Terminal resize failed: ${error}`, true));
  });
  new ResizeObserver(() => fit.fit()).observe(terminalHost);
  terminal.writeln(`\x1b[36mMoraxterm\x1b[0m — ${session.session_type} ${session.host || ''}`);
  terminal.writeln('Persistent terminal ready.');
  terminal.write('\r\n$ ');
  terminal.onData(async data => {
    if (macroRecording) macroBuffer.push(data);
    if (!invoke) return;
    const destinations = multiExec ? [...tabs.keys()] : [id];
    await Promise.all(destinations.map(async target => {
      try { await invoke('write_terminal', { id: target, data }); }
      catch (error) { status(`Terminal input failed: ${error}`, true); }
    }));
  });
  tabs.set(id, { pane, terminal, fit, session, exited: false });
  button.querySelector('em').onclick = event => { event.stopPropagation(); resumeTab(id); };
  button.querySelector('i').onclick = event => { event.stopPropagation(); reconnectTab(id); };
  launchTerminal(id, session);
  button.querySelector('b').onclick = event => {
    event.stopPropagation();
    tabs.get(id).terminal.dispose();
    if (invoke) invoke('close_terminal', { id }).catch(error => status(`Terminal close failed: ${error}`, true));
    pane.remove();
    button.remove();
    tabs.delete(id);
    if (tabs.size < 2) panesEl.classList.remove('split-view');
  };
  activate(id);
  return id;
}

function splitActive() {
  if (tabs.size >= 2) { status('Split view already has two panes'); return; }
  const current = activeTab();
  const id = openTab({ name: 'Split Shell', session_type: 'Shell', host: '' });
  panesEl.classList.add('split-view');
  if (current && tabs.has(current)) document.querySelector(`.pane[data-id="${current}"]`)?.classList.add('active');
  document.querySelector(`.pane[data-id="${id}"]`)?.classList.add('active');
  status('Split view enabled');
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

async function showSftpBrowser(host, username, port, initialPath = '.') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="sftp-browser"><header><strong>SFTP — ${host}</strong><button data-close>×</button></header><div class="sftp-controls"><input data-path value="${initialPath}"/><button data-refresh>Refresh</button><button data-up>Up</button><button data-upload>Upload</button><button data-download>Download</button></div><pre data-output>Loading…</pre></section>`;
  document.body.appendChild(overlay);
  const pathInput = overlay.querySelector('[data-path]');
  const output = overlay.querySelector('[data-output]');
  const invokeList = async () => {
    const path = pathInput.value.trim() || '.';
    try { output.textContent = await invoke('sftp_list', { host, username, port, path }); status(`SFTP listing: ${path}`); }
    catch (error) { output.textContent = String(error); status(`SFTP failed: ${error}`, true); }
  };
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.querySelector('[data-refresh]').onclick = invokeList;
  overlay.querySelector('[data-up]').onclick = () => { pathInput.value = pathInput.value.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '.'; invokeList(); };
  overlay.querySelector('[data-upload]').onclick = async () => {
    const localPath = (window.prompt('Local file path:') || '').trim();
    const remotePath = (window.prompt('Remote destination path:', `${pathInput.value}/`) || '').trim();
    if (!localPath || !remotePath) return;
    try { output.textContent = await invoke('sftp_transfer', { host, username, port, direction: 'upload', localPath, remotePath }); status('SFTP upload completed'); invokeList(); }
    catch (error) { output.textContent = String(error); status(`SFTP upload failed: ${error}`, true); }
  };
  overlay.querySelector('[data-download]').onclick = async () => {
    const remotePath = (window.prompt('Remote source path:', pathInput.value) || '').trim();
    const localPath = (window.prompt('Local destination path:') || '').trim();
    if (!localPath || !remotePath) return;
    try { output.textContent = await invoke('sftp_transfer', { host, username, port, direction: 'download', localPath, remotePath }); status('SFTP download completed'); }
    catch (error) { output.textContent = String(error); status(`SFTP download failed: ${error}`, true); }
  };
  await invokeList();
}

async function showXserverStatus() {
  if (!invoke) { status('X server integration is available in the native Tauri app', true); return; }
  try {
    const result = await invoke('xserver_status');
    const id = activeTab();
    const tab = id && tabs.get(id);
    if (tab) { tab.terminal.writeln('\\r\\n\\x1b[36m[X server status]\\x1b[0m'); tab.terminal.write(result.replaceAll('\\n', '\\r\\n')); }
    status('X server status checked');
  } catch (error) { status(`X server check failed: ${error}`, true); }
}

async function runSftpList() {
  if (!invoke) { status('SFTP is available in the native Tauri app', true); return; }
  const operation = (window.prompt('SFTP operation: list, upload, or download', 'list') || '').trim().toLowerCase();
  if (!['list', 'upload', 'download'].includes(operation)) return;
  const host = (window.prompt('SFTP host:') || '').trim();
  const username = (window.prompt('SFTP username:') || '').trim();
  const port = Number(window.prompt('SFTP port:', '22') || '0');
  if (!host || !username) return;
  try {
    let result;
    if (operation === 'list') {
      const path = (window.prompt('Remote path:', '.') || '').trim();
      if (!path) return;
      await showSftpBrowser(host, username, port, path);
      return;
    } else {
      const localPath = (window.prompt(operation === 'upload' ? 'Local file path:' : 'Local destination path:') || '').trim();
      const remotePath = (window.prompt(operation === 'upload' ? 'Remote destination path:' : 'Remote source path:') || '').trim();
      if (!localPath || !remotePath) return;
      result = await invoke('sftp_transfer', { host, username, port, direction: operation, localPath, remotePath });
    }
    const id = activeTab();
    const tab = id && tabs.get(id);
    if (tab) { tab.terminal.writeln(`\\r\\n\\x1b[36m[SFTP ${operation} ${host}]\\x1b[0m`); tab.terminal.write(result.replaceAll('\\n', '\\r\\n')); }
    status(`SFTP ${operation} completed for ${host}`);
  } catch (error) { status(`SFTP failed: ${error}`, true); }
}

async function runNetworkTool() {
  if (!invoke) { status('Network tools are available in the native Tauri app', true); return; }
  const tool = (window.prompt('Tool: ping, traceroute, dns, or port', 'ping') || '').trim().toLowerCase();
  if (!tool) return;
  const target = (window.prompt('Target host or IP:') || '').trim();
  if (!target) return;
  const port = tool === 'port' ? Number(window.prompt('TCP port:', '22') || '0') : null;
  try {
    const result = await invoke('run_network_tool', { tool, target, port });
    const id = activeTab();
    const tab = id && tabs.get(id);
    if (tab) { tab.terminal.writeln(`\\r\\n\\x1b[36m[${tool} ${target}]\\x1b[0m`); tab.terminal.write(result.replaceAll('\\n', '\\r\\n')); }
    status(`${tool} completed for ${target}`);
  } catch (error) { status(`Network tool failed: ${error}`, true); }
}

async function toggleRecording() {
  const id = activeTab();
  if (!id || !invoke) { status('Open a native terminal tab before recording', true); return; }
  const button = document.querySelector('[data-action="record"]');
  if (recordings.has(id)) {
    await invoke('stop_recording', { id });
    recordings.delete(id);
    button?.classList.remove('active');
    status('Terminal recording stopped');
    return;
  }
  const path = (window.prompt('Recording file path:', `moraxterm-${Date.now()}.log`) || '').trim();
  if (!path) return;
  try {
    await invoke('start_recording', { id, path });
    recordings.add(id);
    button?.classList.add('active');
    status(`Recording terminal output to ${path}`);
  } catch (error) { status(`Recording failed: ${error}`, true); }
}

async function toggleTunnel() {
  if (!invoke) { status('Tunneling is available in the native Tauri app', true); return; }
  if (tunnels.size) {
    const id = [...tunnels][0];
    await invoke('stop_tunnel', { id });
    tunnels.delete(id);
    status('SSH tunnel stopped');
    return;
  }
  const mode = (window.prompt('Tunnel mode: local, remote, or dynamic', 'local') || '').trim().toLowerCase();
  if (!mode) return;
  const host = (window.prompt('SSH gateway host:') || '').trim();
  const username = (window.prompt('SSH username (optional):') || '').trim();
  const sshPort = Number(window.prompt('SSH port:', '22') || '22');
  const bind = (window.prompt(mode === 'dynamic' ? 'SOCKS bind address, e.g. 127.0.0.1:1080:' : 'Bind address, e.g. 127.0.0.1:8080:') || '').trim();
  const target = mode === 'dynamic' ? '' : (window.prompt('Target, e.g. 127.0.0.1:80:') || '').trim();
  try {
    const id = await invoke('start_tunnel', { host, username, sshPort, mode, bind, target });
    tunnels.add(id);
    status(`SSH ${mode} tunnel started; click Tunneling to stop`);
  } catch (error) { status(`Tunnel failed: ${error}`, true); }
}

function showSettings() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<form class="session-editor"><h2>Terminal settings</h2><label>Font size<input name="fontSize" type="number" min="8" max="32" value="${terminalSettings.fontSize}"></label><label><input name="cursorBlink" type="checkbox" ${terminalSettings.cursorBlink ? 'checked' : ''}> Cursor blink</label><label>Theme<select name="theme"><option value="dark">Dark</option><option value="amber">Amber</option></select></label><div class="editor-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Apply</button></div></form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  form.theme.value = terminalSettings.theme;
  overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
  form.onsubmit = event => {
    event.preventDefault();
    terminalSettings = { fontSize: Math.max(8, Math.min(32, Number(form.fontSize.value) || 13)), cursorBlink: form.cursorBlink.checked, theme: form.theme.value };
    localStorage.setItem('moraxterm-settings', JSON.stringify(terminalSettings));
    for (const tab of tabs.values()) { tab.terminal.options.fontSize = terminalSettings.fontSize; tab.terminal.options.cursorBlink = terminalSettings.cursorBlink; tab.terminal.options.theme = terminalTheme(); tab.fit.fit(); }
    overlay.remove();
    status('Terminal settings applied');
  };
}

async function macroAction() {
  const button = document.querySelector('[data-action="macros"]');
  const id = activeTab();
  if (!id || !invoke) { status('Open a native terminal before using macros', true); return; }
  if (macroRecording) {
    macroRecording = false;
    button?.classList.remove('active');
    status(`Macro stopped (${macroBuffer.length} input events)`);
    return;
  }
  if (macroBuffer.length && window.confirm('Play the last macro? Choose Cancel to record a new macro.')) {
    for (const data of macroBuffer) await invoke('write_terminal', { id, data });
    status(`Macro played into terminal (${macroBuffer.length} input events)`);
    return;
  }
  macroBuffer = [];
  macroRecording = true;
  button?.classList.add('active');
  status('Macro recording started');
}

function toggleMultiExec() {
  multiExec = !multiExec;
  const button = document.querySelector('[data-action="multiexec"]');
  button?.classList.toggle('active', multiExec);
  status(multiExec ? `MultiExec enabled for ${tabs.size} terminals` : 'MultiExec disabled');
}

function actionMessage(action) {
  if (action === 'split') { splitActive(); return; }
  if (action === 'multiexec') { toggleMultiExec(); return; }
  if (action === 'tunnel') { toggleTunnel(); return; }
  if (action === 'record') { toggleRecording(); return; }
  if (action === 'tools') { runNetworkTool(); return; }
  if (action === 'xserver') { showXserverStatus(); return; }
  if (action === 'sftp') { runSftpList(); return; }
  if (action === 'macros') { macroAction(); return; }
  if (action === 'settings') { showSettings(); return; }
  const messages = { view: 'View controls are ready for terminal and pane settings.', xserver: 'X server integration is queued in the compatibility roadmap.', tools: 'Tools are queued for the network-tools phase.', settings: 'Settings editor is queued for the session-manager phase.', macros: 'Macro recording is queued for the macros phase.', multiexec: 'MultiExec will broadcast commands to selected tabs.', tunnel: 'Tunnel manager is queued for the SSH forwarding phase.', packages: 'Package tools will be connected to the active terminal.' };
  status(messages[action] || 'Moraxterm');
}

document.querySelector('#search').oninput = renderSessions;
document.querySelector('#export-sessions').onclick = exportSessions;
document.querySelector('#import-backup').onclick = importBackup;
document.querySelector('#import-sessions').onclick = importSessions;
document.querySelector('#new-session').onclick = () => showEditor();
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

if (listen) {
  listen('terminal-output', event => {
    const tab = tabs.get(event.payload.id);
    if (tab) tab.terminal.write(event.payload.data);
  });
  listen('terminal-exit', event => {
    const tab = tabs.get(event.payload.id);
    if (tab) {
      tab.exited = true;
      tab.terminal.options.disableStdin = true;
      tab.terminal.writeln('terminal exited');
      status(`Terminal ${event.payload.id} exited`);
    }
  });
}

loadSessions();
