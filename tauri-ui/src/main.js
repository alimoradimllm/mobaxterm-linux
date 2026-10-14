import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';

const invoke = window.__TAURI__?.core?.invoke;
const listen = window.__TAURI__?.event?.listen;
const app = document.querySelector('#app');
app.innerHTML = `
<div class="menu-row"><strong>Moraxterm</strong><button data-action="terminal-menu">Terminal</button><button data-action="sessions">Sessions</button><button data-action="view">View</button><button data-action="xserver">X server</button><button data-action="tools">Tools</button><button data-action="settings">Settings</button><button data-action="macros">Macros</button><button data-action="help">Help</button></div>
<div class="toolbar"><button class="tool primary" data-action="new-shell"><span>▣</span><small>Session</small></button><button class="tool" data-action="sessions"><span>✣</span><small>Servers</small></button><button class="tool" data-action="tools"><span>⚒</span><small>Tools</small></button><button class="tool" data-action="load-sessions"><span>★</span><small>Sessions</small></button><button class="tool" data-action="view"><span>▣</span><small>View</small></button><button class="tool" data-action="split"><span>▤</span><small>Split</small></button><button class="tool" data-action="duplicate"><span>⧉</span><small>Duplicate</small></button><button class="tool" data-action="multiexec"><span>⇄</span><small>MultiExec</small></button><button class="tool" data-action="tunnel"><span>⇆</span><small>Tunneling</small></button><button class="tool" data-action="sftp"><span>⇅</span><small>Packages</small></button><button class="tool" data-action="settings"><span>⚙</span><small>Settings</small></button><button class="tool" data-action="help"><span>?</span><small>Help</small></button><span class="toolbar-spacer"></span><button class="tool" data-action="xserver"><span>⚔</span><small>X server</small></button><button class="tool" data-action="close-app"><span>⏻</span><small>Exit</small></button></div>
<div class="quick"><input id="quick" placeholder="Quick connect..."/><button id="connect">Connect</button></div>
<main><nav class="rail"><button class="rail-button active" title="Sessions" data-rail="sessions">★</button><button class="rail-button" title="Tools" data-rail="tools" data-action="tools">⚒</button><button class="rail-button" title="Macros" data-rail="macros" data-action="macros">➤</button><button class="rail-button" title="Favorites" data-rail="favorites">◆</button></nav><aside class="sidebar"><div class="side-tabs"><button class="selected">Sessions</button><button data-action="tools">Tools</button><button data-action="macros">Macros</button></div><div class="side-search"><input id="search" placeholder="Quick find sessions"/></div><div class="tree-header"><span>★ User sessions</span><button id="import-backup" title="Restore backup">⇩</button><button id="export-sessions" title="Export backup">⇧</button><button id="import-sessions" title="Import sessions">⇩</button><button id="new-session" title="New session">＋</button><button id="new-folder" title="New folder">📁＋</button><button id="rename-folder" title="Rename selected folder">✎</button><button id="delete-folder" title="Delete selected folder">🗑</button><button id="reload" title="Reload sessions">↻</button></div><ul id="sessions"></ul><div class="side-footer"><span>▣ Remote monitoring</span><label><input type="checkbox" checked/> Follow terminal folder</label></div></aside>
<section class="workspace"><div id="home-screen" class="home-screen"><div class="welcome-mark">▣</div><h1>Moraxterm</h1><p class="welcome-subtitle">Your terminal workspace</p><div class="welcome-actions"><button data-action="new-shell">＋ Start local terminal</button><button data-action="load-sessions">↻ Recover previous sessions</button></div><input id="home-search" placeholder="Find existing session or server name..."/><h2>Recent sessions</h2><div id="recent-cards" class="recent-cards"></div></div><nav id="tabs" class="tabs"></nav><div id="panes" class="panes"></div><footer class="status"><span id="status-message">● Loading sessions</span><span>CPU —</span><span>RAM —</span><span>Network —</span><span class="status-spacer"></span><span id="platform">Desktop</span></footer></section></main>`;

const sessionsEl = document.querySelector('#sessions');
const tabsEl = document.querySelector('#tabs');
const panesEl = document.querySelector('#panes');
const statusEl = document.querySelector('#status-message');
let sessions = [];
let sessionFolders = (() => { try { const value = JSON.parse(localStorage.getItem('moraxterm-session-folders') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
let collapsedSessionFolders = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('moraxterm-collapsed-folders') || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch { return new Set(); }
})();
let selectedFolder = '';
function persistCollapsedSessionFolders() {
  localStorage.setItem('moraxterm-collapsed-folders', JSON.stringify([...collapsedSessionFolders]));
}
const tabs = new Map();
const tunnels = new Set();
let tunnelProfiles = (() => { try { const value = JSON.parse(localStorage.getItem('moraxterm-tunnel-profiles') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
const recordings = new Set();
const sftpTransferWaiters = new Map();
let multiExec = false;
let multiExecTargets = new Set();
let macroRecording = false;
let macroBuffer = [];
let recentSessionNames = (() => { try { const value = JSON.parse(localStorage.getItem('moraxterm-recent-sessions') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })();
let terminalSettings = (() => { try { return { fontSize: 13, cursorBlink: true, theme: 'mobaxterm', appTheme: 'mobaxterm', highlightKeywords: true, highlightColor: '#ffd166', ...JSON.parse(localStorage.getItem('moraxterm-settings') || '{}') }; } catch { return { fontSize: 13, cursorBlink: true, theme: 'mobaxterm', appTheme: 'mobaxterm', highlightKeywords: true, highlightColor: '#ffd166' }; } })();
const fallback = [
  { name: 'Local Shell', session_type: 'Shell', host: '' },
  { name: 'WSL-Debian', session_type: 'WSL', host: 'Debian' },
];

function status(message, error = false) {
  statusEl.textContent = `${error ? '● Error' : '●'} ${message}`;
  statusEl.style.color = error ? '#ff6b6b' : '#55d18a';
}

function applyAppTheme() {
  document.documentElement.dataset.appTheme = terminalSettings.appTheme || 'mobaxterm';
}
applyAppTheme();

function debugLog(component, message) {
  if (!invoke) return;
  invoke('debug_log', { component, message: String(message) }).catch(() => {});
}

try {
  const debugSettings = JSON.parse(localStorage.getItem('moraxterm-debug-settings') || '{}');
  if (debugSettings.enabled) invoke('configure_debug_logging', { enabled: true, path: debugSettings.path || '' }).catch(() => {});
} catch { /* ignore malformed local settings */ }

debugLog('frontend', 'application initialized');

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
    const group = session.folder || session.group || session.session_type || 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(session);
  });
  sessionFolders.forEach(folder => { if (!groups.has(folder)) groups.set(folder, []); });
  const renderedFolders = new Set();
  for (const [group, items] of groups) {
    const parts = group.split(/[\\/]/).filter(Boolean);
    parts.forEach((part, depth) => {
      const parentFolders = parts.slice(0, depth).map((_, index) => parts.slice(0, index + 1).join('/'));
      if (parentFolders.some(folder => collapsedSessionFolders.has(folder))) return;
      const folder = parts.slice(0, depth + 1).join('/');
      if (renderedFolders.has(folder)) return;
      renderedFolders.add(folder);
      const heading = document.createElement('li');
      heading.className = 'session-group';
      heading.dataset.folder = folder;
      heading.dataset.dropTarget = 'session-folder';
      heading.title = 'Click to expand/collapse; drop a session here to move it into this folder';
      heading.onclick = () => {
        selectedFolder = folder;
        if (collapsedSessionFolders.has(folder)) collapsedSessionFolders.delete(folder);
        else collapsedSessionFolders.add(folder);
        persistCollapsedSessionFolders();
        renderSessions();
      };
      heading.style.paddingLeft = `${12 + depth * 14}px`;
      heading.textContent = `${collapsedSessionFolders.has(folder) ? '▸' : '▾'} ${part}`;
      heading.ondragover = event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; heading.classList.add('drop-target'); };
      heading.ondragleave = () => { heading.classList.remove('drop-target'); };
      heading.ondrop = async event => {
        event.preventDefault();
        heading.classList.remove('drop-target');
        if (group === 'Recent') return;
        const name = event.dataTransfer?.getData('text/session-name');
        const session = sessions.find(item => item.name === name);
        const previousFolder = session?.folder || '';
        if (!session || session.folder === folder) return;
        session.folder = folder;
        try {
          if (invoke) await invoke('save_session', { session });
          status(`Moved ${session.name} to ${folder}`);
          renderSessions();
        } catch (error) {
          session.folder = previousFolder;
          status(`Move failed: ${error}`, true);
          renderSessions();
        }
      };
      sessionsEl.appendChild(heading);
    });
    const groupFolders = parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    if (groupFolders.some(folder => collapsedSessionFolders.has(folder))) continue;
    items.forEach(session => {
      const li = document.createElement('li');
      li.className = 'session-entry';
      li.draggable = true;
      li.dataset.sessionName = session.name;
      li.title = 'Drag this session onto a folder to move it';
      li.ondragstart = event => {
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/session-name', session.name); event.dataTransfer.setData('text/plain', session.name); }
        li.classList.add('dragging');
      };
      li.ondragend = () => li.classList.remove('dragging');
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
  menu.innerHTML = `<button data-open>Open</button><button data-edit>Edit</button><button data-duplicate>Duplicate</button><button data-favorite>${session.favorite ? 'Remove favorite' : 'Add favorite'}</button><button data-delete>Delete</button>`;
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  document.addEventListener('click', close);
  menu.querySelector('[data-open]').onclick = () => { close(); openTab(session); };
  menu.querySelector('[data-edit]').onclick = () => { close(); showEditor(session); };
  menu.querySelector('[data-duplicate]').onclick = () => { close(); showEditor({ ...session, name: `${session.name} copy`, favorite: false }); };
  menu.querySelector('[data-favorite]').onclick = async () => { close(); session.favorite = !session.favorite; if (invoke) await invoke('save_session', { session }); renderSessions(); };
  menu.querySelector('[data-delete]').onclick = async () => { close(); if (invoke) await invoke('delete_session', { name: session.name }); sessions = sessions.filter(item => item.name !== session.name); recentSessionNames = recentSessionNames.filter(name => name !== session.name); localStorage.setItem('moraxterm-recent-sessions', JSON.stringify(recentSessionNames)); renderSessions(); };
}

function renderHome() {
  const cards = document.querySelector('#recent-cards');
  if (!cards) return;
  const recent = recentSessionNames.map(name => sessions.find(session => session.name === name)).filter(Boolean).slice(0, 6);
  const items = recent.length ? recent : sessions.slice(0, 6);
  cards.innerHTML = items.map(session => `<button class="recent-card" data-session-name="${session.name.replaceAll('"', '&quot;')}"><span>${iconFor(session.session_type)}</span><strong>${session.name}</strong><small>${session.host || session.session_type}</small></button>`).join('') || '<span class="recent-empty">No recent sessions yet</span>';
  cards.querySelectorAll('.recent-card').forEach(card => { card.onclick = () => { const session = sessions.find(item => item.name === card.dataset.sessionName); if (session) openTab(session); }; });
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
  renderHome();
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
  const path = window.prompt('Path to a sanitized INI export:', 'SanitizedSessions.ini');
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
  overlay.innerHTML = `<form class="session-editor"><h2>${session.name ? 'Edit session' : 'New session'}</h2><label>Name<input name="name" required value="${session.name || ''}"></label><label>Type<select name="session_type"><option>SSH</option><option>Rdp</option><option>Vnc</option><option>WSL</option><option>Shell</option><option>Telnet</option><option>Serial</option></select></label><label>Host<input name="host" value="${session.host || ''}"></label><label>Username<input name="username" value="${session.username || ''}"></label><label>Port<input name="port" type="number" min="0" max="65535" value="${session.port || 22}"></label><label>Folder<input name="folder" value="${session.folder || ''}" placeholder="Servers/Linux/Production"></label><label>Working directory<input name="working_directory" value="${session.working_directory || ''}"></label><label>Shell<input name="shell" value="${session.shell || ''}" placeholder="Auto / bash / PowerShell"></label><label>SSH gateway / ProxyJump<input name="proxy_jump" value="${session.proxy_jump || ''}" placeholder="user@gateway:22"></label><label>Host-key policy<select name="host_key_policy"><option value="ask">Ask before accepting</option><option value="strict">Strict known-hosts only</option><option value="accept-new">Accept new, reject changed</option></select></label><label>Keepalive seconds<input name="keepalive_seconds" type="number" min="0" max="3600" value="${session.keepalive_seconds ?? 30}"></label><label>Serial baud<input name="serial_baud" type="number" min="0" value="${session.serial_baud || 115200}"></label><label>Serial data bits<input name="serial_data_bits" type="number" min="5" max="8" value="${session.serial_data_bits || 8}"></label><label>Serial parity<input name="serial_parity" value="${session.serial_parity || 'none'}"></label><label>Serial stop bits<input name="serial_stop_bits" type="number" min="1" max="2" value="${session.serial_stop_bits || 1}"></label><label>Serial flow control<input name="serial_flow_control" value="${session.serial_flow_control || 'none'}"></label><label>Environment (non-secret KEY=VALUE, one per line)<textarea name="environment" rows="3">${Object.entries(session.environment || {}).map(([key, value]) => `${key}=${value}`).join('\\n')}</textarea></label><label>Startup command (non-secret)<input name="startup_command" value="${session.startup_command || ''}"></label><label>Bookmark group<input name="group" value="${session.group || ''}"></label><label><input name="favorite" type="checkbox" ${session.favorite ? 'checked' : ''}> Favorite</label><div class="editor-actions"><button type="button" data-cancel>Cancel</button>${session.name ? '<button type="button" data-delete>Delete</button>' : ''}<button type="submit">Save</button></div></form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  form.classList.add('mobaxterm-session-editor');
  form.insertAdjacentHTML('afterbegin', `<div class="editor-protocols"><button type="button" class="active">🔑 SSH</button><button type="button">⌁ Telnet</button><button type="button">▣ RDP</button><button type="button">◉ VNC</button><button type="button">▸ WSL</button><button type="button">⌂ Shell</button><button type="button">⌁ Serial</button></div><div class="editor-summary"><span class="editor-session-icon">${iconFor(session.session_type || 'SSH')}</span><div><strong>${session.name ? 'Edit session' : 'New session'}</strong><small>Configure connection, terminal, network, and bookmark behavior</small></div></div><nav class="editor-tabs"><button type="button" class="active">Basic settings</button><button type="button">Advanced settings</button><button type="button">Terminal settings</button><button type="button">Network settings</button><button type="button">Bookmark settings</button></nav>`);
  const sshAgentRow = document.createElement('label');
  sshAgentRow.className = 'editor-status-row';
  sshAgentRow.innerHTML = `SSH agent monitoring <input type="checkbox" name="ssh_agent_monitor" ${session.ssh_agent_monitor !== false ? 'checked' : ''}><button type="button" data-agent-check>Check agent</button><span data-agent-status>Not checked</span>`;
  form.querySelector('[name="username"]')?.closest('label')?.after(sshAgentRow);
  sshAgentRow.querySelector('[data-agent-check]').onclick = async () => {
    try { sshAgentRow.querySelector('[data-agent-status]').textContent = ` ${await invoke('ssh_agent_status')}`; }
    catch (error) { sshAgentRow.querySelector('[data-agent-status]').textContent = ` ${error}`; }
  };
  const highlightRow = document.createElement('label');
  highlightRow.className = 'editor-status-row';
  highlightRow.innerHTML = 'Terminal keyword highlighting <input type="checkbox" name="highlight_keywords"><input type="color" name="highlight_color" title="Highlight color"> <span>error, warning, failed, connected, OK</span>';
  form.querySelector('[name="shell"]')?.closest('label')?.after(highlightRow);
  highlightRow.querySelector('[name="highlight_keywords"]').checked = terminalSettings.highlightKeywords !== false;
  highlightRow.querySelector('[name="highlight_color"]').value = terminalSettings.highlightColor || '#ffd166';
  const protocolFields = [['wsl_user', 'WSL user', session.wsl_user || '', 'Optional Linux user'], ['wsl_command', 'WSL command', session.wsl_command || '', 'Optional command'], ['telnet_mode', 'Telnet mode', session.telnet_mode || '', 'Raw / line']];
  const serialField = form.querySelector('[name="serial_flow_control"]');
  protocolFields.forEach(([name, label, value, placeholder]) => { const wrapper = document.createElement('label'); wrapper.textContent = label; const input = document.createElement('input'); input.name = name; input.value = value; input.placeholder = placeholder; wrapper.appendChild(input); serialField?.closest('label')?.after(wrapper); });
  form.querySelectorAll('[name="wsl_user"], [name="wsl_command"], [name="telnet_mode"]').forEach(field => field.closest('label')?.setAttribute('data-editor-section', 'advanced'));
  const knownHostsRow = document.createElement('label');
  knownHostsRow.innerHTML = 'Known-hosts status <button type="button" data-known-hosts>Check</button><button type="button" data-known-hosts-scan>Scan fingerprint</button><button type="button" data-known-hosts-approve disabled>Approve scanned key</button><span data-known-hosts-status></span>';
  form.host_key_policy.closest('label')?.after(knownHostsRow);
  knownHostsRow.querySelector('[data-known-hosts]').onclick = async () => {
    try {
      const result = await invoke('ssh_known_hosts_status', { host: form.host.value.trim(), port: Number(form.port.value || 22) });
      knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${result}`;
    } catch (error) { knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${error}`; }
  };
  let scannedFingerprint = '';
  knownHostsRow.querySelector('[data-known-hosts-scan]').onclick = async () => {
    try {
      scannedFingerprint = await invoke('ssh_known_hosts_scan', { host: form.host.value.trim(), port: Number(form.port.value || 22) });
      knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${scannedFingerprint}`;
      knownHostsRow.querySelector('[data-known-hosts-approve]').disabled = false;
    } catch (error) { scannedFingerprint = ''; knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${error}`; }
  };
  knownHostsRow.querySelector('[data-known-hosts-approve]').onclick = async () => {
    if (!scannedFingerprint || !confirm(`Approve this scanned host key?\\n\\n${scannedFingerprint}`)) return;
    try { knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${await invoke('ssh_known_hosts_add', { host: form.host.value.trim(), port: Number(form.port.value || 22), expectedFingerprint: scannedFingerprint })}`; }
    catch (error) { knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${error}`; }
  };
  const credentialRow = document.createElement('label');
  credentialRow.innerHTML = 'SSH credential <input type="password" name="ssh_secret" autocomplete="new-password" placeholder="Leave blank to keep unchanged"><button type="button" data-credential-status>Check saved</button><button type="button" data-credential-delete>Delete saved</button><span data-credential-message></span>';
  knownHostsRow.after(credentialRow);
  const credentialAccount = () => `${form.username.value.trim()}@${form.host.value.trim()}:${Number(form.port.value || 22)}`;
  const credentialMessage = message => { credentialRow.querySelector('[data-credential-message]').textContent = ` ${message}`; };
  credentialRow.querySelector('[data-credential-status]').onclick = async () => {
    try { const saved = await invoke('credential_status', { service: 'com.moraxterm.ssh', account: credentialAccount() }); credentialMessage(saved ? 'saved credential exists' : 'no saved credential'); }
    catch (error) { credentialMessage(String(error)); }
  };
  credentialRow.querySelector('[data-credential-delete]').onclick = async () => {
    try { const deleted = await invoke('credential_delete', { service: 'com.moraxterm.ssh', account: credentialAccount() }); credentialMessage(deleted ? 'saved credential deleted' : 'no saved credential'); }
    catch (error) { credentialMessage(String(error)); }
  };
  knownHostsRow.querySelector('[data-known-hosts]').insertAdjacentHTML('afterend', '<button type="button" data-known-hosts-remove>Remove stale entry</button>');
  knownHostsRow.querySelector('[data-known-hosts-remove]').onclick = async () => {
    if (!confirm('Remove this host entry from known_hosts?')) return;
    try { knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${await invoke('ssh_known_hosts_remove', { host: form.host.value.trim(), port: Number(form.port.value || 22) })}`; }
    catch (error) { knownHostsRow.querySelector('[data-known-hosts-status]').textContent = ` ${error}`; }
  };
  const sectionFields = {
    basic: ['name', 'session_type', 'host', 'username', 'port', 'folder'],
    advanced: ['working_directory', 'shell', 'proxy_jump', 'host_key_policy', 'keepalive_seconds', 'serial_baud', 'serial_data_bits', 'serial_parity', 'serial_stop_bits', 'serial_flow_control', 'wsl_user', 'wsl_command', 'telnet_mode', 'environment', 'startup_command'],
    terminal: ['highlight_keywords', 'highlight_color'],
    network: ['ssh_agent_monitor'],
    bookmark: ['group', 'favorite']
  };
  const fieldSections = new Map(Object.entries(sectionFields).flatMap(([section, names]) => names.map(name => [name, section])));
  form.querySelectorAll('input[name], select[name], textarea[name]').forEach(field => {
    const label = field.closest('label');
    const section = fieldSections.get(field.name) || 'advanced';
    label?.setAttribute('data-editor-section', section);
  });
  knownHostsRow.setAttribute('data-editor-section', 'network');
  credentialRow.setAttribute('data-editor-section', 'network');
  const editorTabs = [...form.querySelectorAll('.editor-tabs button')];
  const showEditorSection = section => {
    form.querySelectorAll('[data-editor-section]:not(.editor-tabs button)').forEach(row => { row.hidden = row.dataset.editorSection !== section; });
    editorTabs.forEach(button => button.classList.toggle('active', button.dataset.editorSection === section));
  };
  editorTabs.forEach((button, index) => {
    button.dataset.editorSection = ['basic', 'advanced', 'terminal', 'network', 'bookmark'][index];
    button.onclick = () => showEditorSection(button.dataset.editorSection);
  });
  const protocolButtons = [...form.querySelectorAll('.editor-protocols button')];
  const protocolTypes = ['SSH', 'Telnet', 'Rdp', 'Vnc', 'WSL', 'Shell', 'Serial'];
  const selectProtocol = type => {
    form.session_type.value = type;
    protocolButtons.forEach((button, index) => button.classList.toggle('active', protocolTypes[index] === type));
    showEditorSection(type === 'SSH' ? 'basic' : 'advanced');
  };
  protocolButtons.forEach((button, index) => {
    button.dataset.protocol = protocolTypes[index];
    button.onclick = () => selectProtocol(button.dataset.protocol);
  });
  showEditorSection('basic');
  selectProtocol(session.session_type || 'SSH');
  const checkAgent = async () => {
    if (form.session_type.value.toUpperCase() !== 'SSH' || !sshAgentRow.querySelector('[name="ssh_agent_monitor"]').checked) return;
    try { sshAgentRow.querySelector('[data-agent-status]').textContent = ` ${await invoke('ssh_agent_status')}`; }
    catch (error) { sshAgentRow.querySelector('[data-agent-status]').textContent = ` ${error}`; }
  };
  const agentTimer = setInterval(checkAgent, 10000);
  checkAgent();
  const cleanupEditor = () => { clearInterval(agentTimer); overlay.remove(); };
  form.session_type.value = session.session_type || 'SSH';
  form.host_key_policy.value = session.host_key_policy || 'ask';
  overlay.querySelector('[data-cancel]').onclick = cleanupEditor;
  overlay.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (invoke) await invoke('delete_session', { name: session.name });
    cleanupEditor();
    await loadSessions();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    const environment = Object.fromEntries(String(values.get('environment') || '').split('\\n').map(line => line.trim()).filter(line => line && line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1)]; }));
    const record = { name: values.get('name'), session_type: values.get('session_type'), host: values.get('host') || '', username: values.get('username') || '', port: Number(values.get('port') || 0), folder: values.get('folder') || '', working_directory: values.get('working_directory') || '', shell: values.get('shell') || '', proxy_jump: values.get('proxy_jump') || '', host_key_policy: values.get('host_key_policy') || 'ask', keepalive_seconds: Number(values.get('keepalive_seconds') || 0), serial_baud: Number(values.get('serial_baud') || 0), serial_data_bits: Number(values.get('serial_data_bits') || 0), serial_parity: values.get('serial_parity') || '', serial_stop_bits: Number(values.get('serial_stop_bits') || 0), serial_flow_control: values.get('serial_flow_control') || '', wsl_user: values.get('wsl_user') || '', wsl_command: values.get('wsl_command') || '', telnet_mode: values.get('telnet_mode') || '', environment, startup_command: values.get('startup_command') || '', group: values.get('group') || '', favorite: form.favorite.checked };
    record.ssh_agent_monitor = form.querySelector('[name="ssh_agent_monitor"]')?.checked !== false;
    terminalSettings.highlightKeywords = form.querySelector('[name="highlight_keywords"]')?.checked !== false;
    terminalSettings.highlightColor = form.querySelector('[name="highlight_color"]')?.value || '#ffd166';
    localStorage.setItem('moraxterm-settings', JSON.stringify(terminalSettings));
    for (const tab of tabs.values()) tab.terminal.options.theme = terminalTheme();
    try {
      if (invoke) {
        await invoke('save_session', { session: record });
        const secret = String(values.get('ssh_secret') || '');
        if (secret && record.session_type.toUpperCase() === 'SSH') await invoke('credential_store', { service: 'com.moraxterm.ssh', account: `${record.username.trim()}@${record.host.trim()}:${record.port}`, secret });
      }
      cleanupEditor();
      await loadSessions();
      status(`Saved ${record.name}`);
    } catch (error) { status(`Save failed: ${error}`, true); }
  };
}

function terminalTheme() {
  const themes = {
    mobaxterm: { background: '#050505', foreground: '#e8e8e8', cursor: '#24d66b', black: '#050505', green: '#24d66b', cyan: '#19c5d1', blue: '#4d9cff', yellow: '#ffd166', red: '#ff6259', magenta: '#d28cff', white: '#f4f4f4' },
    dark: { background: '#101113', foreground: '#d7d7d7', cursor: '#00d084', black: '#101113', green: '#00d084', cyan: '#00c8d7', blue: '#4d9cff', yellow: '#e6d85a', red: '#ff5c57', magenta: '#d28cff', white: '#f5f5f5' },
    amber: { background: '#17120a', foreground: '#ffd27a', cursor: '#ffb000', black: '#17120a', green: '#d9b44a', cyan: '#e0b35a', blue: '#d99a3e', yellow: '#ffe08a', red: '#ff7657', magenta: '#db9bff', white: '#fff1c7' },
    light: { background: '#f4f6f8', foreground: '#1b2430', cursor: '#1769aa', black: '#1b2430', green: '#087f5b', cyan: '#087f8c', blue: '#1769aa', yellow: '#9a6700', red: '#c92a2a', magenta: '#862e9c', white: '#ffffff' },
    neon: { background: '#090018', foreground: '#f4ecff', cursor: '#00f5d4', black: '#090018', green: '#00f5d4', cyan: '#00bbf9', blue: '#4361ee', yellow: '#fee440', red: '#f15bb5', magenta: '#c77dff', white: '#ffffff' }
  };
  return themes[terminalSettings.theme] || themes.mobaxterm;
}

function highlightTerminalText(data) {
  if (!terminalSettings.highlightKeywords || !data) return data;
  const color = terminalSettings.highlightColor || '#ffd166';
  const words = /\\b(error|warning|failed|failure|success|successful|connected|disconnected|denied|permission|ok)\\b/gi;
  return String(data).replace(words, match => `\\x1b[38;2;${parseInt(color.slice(1, 3), 16)};${parseInt(color.slice(3, 5), 16)};${parseInt(color.slice(5, 7), 16)}m${match}\\x1b[0m`);
}

function setTabConnectionState(id, state) {
  const button = tabsEl.querySelector(`[data-id="${id}"]`);
  const colors = { starting: '#d6a84f', connected: '#42c883', failed: '#e05b63', exited: '#7d8791' };
  if (button) {
    button.dataset.connectionState = state;
    button.style.borderBottom = `2px solid ${colors[state] || colors.exited}`;
    button.title = `${button.textContent.replace(/[▶↻×]/g, '').trim()} — ${state}`;
  }
  const tab = tabs.get(id);
  if (tab) tab.connectionState = state;
}

function launchTerminal(id, session) {
  if (!invoke) return;
  const tab = tabs.get(id);
  if (tab) {
    setTabConnectionState(id, 'starting');
    tab.terminal.options.disableStdin = false;
  }
  status(`Starting ${session.name || session.session_type}...`);
  debugLog('frontend', `start_terminal requested id=${id} type=${session.session_type} name=${session.name}`);
  const preflight = session.session_type?.toUpperCase() === 'SSH' && session.host_key_policy === 'strict'
    ? invoke('ssh_known_hosts_status', { host: session.host, port: Number(session.port || 22) }).then(result => {
      if (!String(result).includes('entry_present=true')) throw new Error('strict host-key policy requires an existing known_hosts entry');
    })
    : Promise.resolve();
  preflight.then(() => invoke('start_terminal', { id, session: ['SSH', 'RDP', 'Rdp', 'VNC', 'Vnc', 'WSL', 'Telnet', 'Serial'].includes(session.session_type) ? session : null, program: null }))
    .then(() => {
      const active = tabs.get(id);
      setTabConnectionState(id, 'connected');
      debugLog('frontend', `start_terminal accepted id=${id}`);
      status(`${session.name || session.session_type} started`);
    })
    .catch(error => {
      const active = tabs.get(id);
      if (active) {
        setTabConnectionState(id, 'failed');
        active.exited = true;
        active.terminal.options.disableStdin = true;
      }
      debugLog('frontend', `start_terminal failed id=${id} error=${error}`);
      status(`Terminal start failed: ${error}`, true);
    });
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
  const existing = [...tabs.entries()].find(([, tab]) => !tab.exited && tab.session.name === session.name && tab.session.session_type === session.session_type);
  if (existing) {
    activate(existing[0]);
    debugLog('frontend', `reused existing terminal id=${existing[0]} name=${session.name}`);
    return existing[0];
  }
  document.querySelector('#home-screen')?.classList.add('hidden');
  rememberRecent(session);
  const id = `tab-${Date.now()}-${tabs.size}`;
  const button = document.createElement('button');
  button.dataset.id = id;
  button.draggable = true;
  button.innerHTML = `<span class="tab-icon">${iconFor(session.session_type)}</span>${session.name}<em title="Resume suspended process">▶</em><i title="Reconnect">↻</i><b>×</b>`;
  button.onclick = () => activate(id);
  button.ondragstart = event => {
    event.dataTransfer?.setData('text/moraxterm-tab', id);
    event.dataTransfer?.setData('text/plain', id);
  };
  button.ondragover = event => { event.preventDefault(); button.classList.add('drop-target'); };
  button.ondragleave = () => button.classList.remove('drop-target');
  button.ondrop = event => {
    event.preventDefault();
    button.classList.remove('drop-target');
    const draggedId = event.dataTransfer?.getData('text/moraxterm-tab');
    const dragged = draggedId && tabsEl.querySelector(`[data-id="${draggedId}"]`);
    if (dragged && dragged !== button) {
      const rect = button.getBoundingClientRect();
      tabsEl.insertBefore(dragged, event.clientX < rect.left + rect.width / 2 ? button : button.nextSibling);
      status(`Moved tab: ${tabs.get(draggedId)?.session.name || draggedId}`);
    }
  };
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
  terminal.focus();
  fit.fit();
  terminal.onResize(({ cols, rows }) => {
    if (invoke) invoke('resize_terminal', { id, cols, rows }).catch(error => status(`Terminal resize failed: ${error}`, true));
  });
  new ResizeObserver(() => fit.fit()).observe(terminalHost);
  terminal.writeln(`\x1b[36mMoraxterm\x1b[0m — ${session.session_type} ${session.host || ''}`);
  terminal.writeln('Starting terminal process...');
  terminal.onData(async data => {
    if (macroRecording) macroBuffer.push(data);
    if (!invoke) return;
    const destinations = multiExec ? [...(multiExecTargets.size ? multiExecTargets : tabs.keys())] : [id];
    await Promise.all(destinations.map(async target => {
      try { await invoke('write_terminal', { id: target, data }); }
      catch (error) { status(`Terminal input failed: ${error}`, true); }
    }));
  });
  tabs.set(id, { pane, terminal, fit, session, exited: false, outputSeen: false, connectionState: 'starting' });
  button.querySelector('em').onclick = event => { event.stopPropagation(); resumeTab(id); };
  button.querySelector('i').onclick = event => { event.stopPropagation(); reconnectTab(id); };
  launchTerminal(id, session);
  button.querySelector('b').onclick = event => {
    event.stopPropagation();
    closeTab(id);
  };
  activate(id);
  return id;
}

function splitActive() {
  if (tabs.size >= 2) { status('Split view already has two panes'); return; }
  const current = activeTab();
  const id = openTab({ name: 'Split Shell', session_type: 'Shell', host: '' });
  panesEl.classList.add('split-view');
  let divider = panesEl.querySelector('.pane-divider');
  if (!divider) {
    divider = document.createElement('div');
    divider.className = 'pane-divider';
    divider.title = 'Drag to resize panes';
    panesEl.insertBefore(divider, panesEl.children[1] || null);
    divider.onpointerdown = event => {
      event.preventDefault();
      divider.setPointerCapture?.(event.pointerId);
      const move = moveEvent => {
        const bounds = panesEl.getBoundingClientRect();
        const ratio = Math.min(0.85, Math.max(0.15, (moveEvent.clientX - bounds.left) / bounds.width));
        panesEl.style.setProperty('--split-ratio', `${ratio * 100}%`);
        tabs.forEach(tab => tab.fit.fit());
      };
      const stop = () => {
        divider.releasePointerCapture?.(event.pointerId);
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', stop);
      };
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', stop, { once: true });
    };
  }
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

function closeTab(id, { confirmClose = true } = {}) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (confirmClose && !tab.exited && ['starting', 'connected'].includes(tab.connectionState)) {
    const name = tab.session?.name || id;
    if (!window.confirm(`Close active terminal "${name}"?`)) return;
  }
  tab.terminal.dispose();
  if (invoke) invoke('close_terminal', { id }).catch(error => status(`Terminal close failed: ${error}`, true));
  tab.pane.remove();
  tabsEl.querySelector(`[data-id="${id}"]`)?.remove();
  tabs.delete(id);
  multiExecTargets.delete(id);
  if (tabs.size < 2) {
    panesEl.classList.remove('split-view');
    panesEl.querySelector('.pane-divider')?.remove();
    panesEl.style.removeProperty('--split-ratio');
  }
  const next = tabs.keys().next().value;
  if (next) activate(next);
  else document.querySelector('#home-screen')?.classList.remove('hidden');
}

function closeActiveTab() {
  const id = activeTab();
  if (!id) return;
  closeTab(id);
}

async function showSftpBrowser(host, username, port, initialPath = '.') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="sftp-browser"><header><strong>SFTP — ${host}</strong><button data-close>×</button></header><div class="sftp-controls"><input data-path value="${initialPath}"/><button data-refresh>Refresh</button><button data-up>Up</button><button data-upload>Upload</button><button data-download>Download</button><button data-mkdir>New folder</button><button data-rename>Rename</button><button data-delete>Delete</button><button data-chmod>Permissions</button><button data-remote-preview>Preview remote</button><label><input type="checkbox" data-resume> Resume partial transfer</label></div><div class="sftp-columns"><section><h3>Remote</h3><pre data-output>Loading…</pre><pre data-remote-preview-output></pre></section><section><h3>Local</h3><div class="sftp-controls"><input data-local-path value="."/><button data-local-refresh>Refresh</button><button data-local-up>Up</button><button data-local-preview>Preview file</button></div><div data-drop-zone style="border:1px dashed var(--border);padding:8px;margin:6px 0">Drop local files here to upload</div><pre data-local-output>Loading…</pre><pre data-local-preview-output></pre></section></div><section><h3>Transfer queue</h3><div data-transfer-queue>No transfers queued.</div></section></section>`;
  document.body.appendChild(overlay);
  const pathInput = overlay.querySelector('[data-path]');
  const output = overlay.querySelector('[data-output]');
  const remotePreviewOutput = overlay.querySelector('[data-remote-preview-output]');
  const localPathInput = overlay.querySelector('[data-local-path]');
  const localOutput = overlay.querySelector('[data-local-output]');
  const resumeInput = overlay.querySelector('[data-resume]');
  const dropZone = overlay.querySelector('[data-drop-zone]');
  const previewOutput = overlay.querySelector('[data-local-preview-output]');
  const queueOutput = overlay.querySelector('[data-transfer-queue]');
  const transferQueue = [];
  let transferRunning = false;
  const invokeList = async () => {
    const path = pathInput.value.trim() || '.';
    try { output.textContent = await invoke('sftp_list', { host, username, port, path }); status(`SFTP listing: ${path}`); }
    catch (error) { output.textContent = String(error); status(`SFTP failed: ${error}`, true); }
  };
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.querySelector('[data-refresh]').onclick = invokeList;
  overlay.querySelector('[data-up]').onclick = () => { pathInput.value = pathInput.value.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '.'; invokeList(); };
  const invokeLocalList = async () => {
    const path = localPathInput.value.trim() || '.';
    try { localOutput.textContent = await invoke('local_list', { path }); status(`Local listing: ${path}`); }
    catch (error) { localOutput.textContent = String(error); status(`Local listing failed: ${error}`, true); }
  };
  overlay.querySelector('[data-local-refresh]').onclick = invokeLocalList;
  overlay.querySelector('[data-local-up]').onclick = () => {
    const path = localPathInput.value.trim() || '.';
    const separator = path.includes('\\') ? '\\' : '/';
    localPathInput.value = path.replace(/[\\/]+$/, '').split(/[\\/]/).slice(0, -1).join(separator) || '.';
    invokeLocalList();
  };
  overlay.querySelector('[data-local-preview]').onclick = async () => {
    const path = (window.prompt('Local text file path:', localPathInput.value) || '').trim();
    if (!path) return;
    try { previewOutput.textContent = await invoke('local_preview', { path }); status(`Previewed local file: ${path}`); }
    catch (error) { previewOutput.textContent = String(error); status(`Preview failed: ${error}`, true); }
  };
  overlay.querySelector('[data-remote-preview]').onclick = async () => {
    const path = (window.prompt('Remote text file path:', pathInput.value) || '').trim();
    if (!path) return;
    try { remotePreviewOutput.textContent = await invoke('sftp_preview', { host, username, port, remotePath: path }); status(`Previewed remote file: ${path}`); }
    catch (error) { remotePreviewOutput.textContent = String(error); status(`Remote preview failed: ${error}`, true); }
  };
  dropZone.ondragover = event => { event.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--border)'; };
  dropZone.ondrop = event => {
    event.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    [...(event.dataTransfer?.files || [])].forEach(file => {
      const localPath = file.path || file.name;
      const remotePath = window.prompt('Remote destination path:', `${pathInput.value.replace(/\/+$/, '')}/${file.name}`);
      if (localPath && remotePath) enqueueTransfer('upload', localPath, remotePath);
    });
  };
  const renderQueue = () => {
    if (!transferQueue.length) { queueOutput.textContent = 'No transfers queued.'; return; }
    queueOutput.innerHTML = transferQueue.map(item => {
      const cancel = ['queued', 'running'].includes(item.state) ? `<button data-cancel-transfer="${item.id}">Cancel</button>` : '';
      const progress = Number.isFinite(item.transferredBytes) ? ` <small>${item.transferredBytes.toLocaleString()} bytes${Number.isFinite(item.totalBytes) ? ` / ${item.totalBytes.toLocaleString()}` : ''}</small>` : '';
      return `<div><strong>${item.direction}</strong> ${item.localPath} → ${item.remotePath} <span>${item.state}</span>${progress}${cancel}</div>`;
    }).join('');
    queueOutput.querySelectorAll('[data-cancel-transfer]').forEach(button => {
      button.onclick = () => {
        const item = transferQueue.find(entry => entry.id === button.dataset.cancelTransfer);
        if (item?.state === 'queued') { item.state = 'cancelled'; renderQueue(); }
        else if (item?.state === 'running') {
          item.cancelRequested = true;
          item.state = 'cancelling';
          renderQueue();
          invoke('cancel_sftp_transfer', { id: item.jobId }).catch(error => { item.state = 'failed'; item.result = String(error); renderQueue(); });
        }
      };
    });
  };
  const runTransferQueue = async () => {
    if (transferRunning) return;
    transferRunning = true;
    try {
      while (true) {
        const item = transferQueue.find(entry => ['queued', 'retrying'].includes(entry.state));
        if (!item) break;
        item.attempts += 1;
        item.state = item.attempts > 1 ? 'retrying' : 'running';
        renderQueue();
        try {
          const event = await startSftpTransferJob({ host, username, port, direction: item.direction, localPath: item.localPath, remotePath: item.remotePath, resume: item.resume }, progress => { item.transferredBytes = progress.transferred_bytes; item.totalBytes = progress.total_bytes; renderQueue(); });
          item.jobId = event.id;
          item.result = event.message;
          item.state = event.success ? 'completed' : (item.cancelRequested ? 'cancelled' : (item.attempts < 2 ? 'retrying' : 'failed'));
          status(`SFTP ${item.direction} ${item.state}`, !event.success && item.state !== 'retrying');
        } catch (error) {
          item.state = item.attempts < 2 ? 'retrying' : 'failed';
          item.result = String(error);
          status(`SFTP ${item.direction} ${item.state}: ${error}`, item.state === 'failed');
        }
        renderQueue();
        if (item.state === 'retrying') await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      transferRunning = false;
    }
  };
  const enqueueTransfer = (direction, localPath, remotePath) => {
    transferQueue.push({ id: `transfer-${Date.now()}-${transferQueue.length}`, direction, localPath, remotePath, resume: resumeInput.checked, state: 'queued', jobId: '', cancelRequested: false, attempts: 0, transferredBytes: null, totalBytes: null });
    renderQueue();
    runTransferQueue();
  };
  overlay.querySelector('[data-upload]').onclick = async () => {
    const localPath = (window.prompt('Local file path:', localPathInput.value) || '').trim();
    const remotePath = (window.prompt('Remote destination path:', `${pathInput.value}/`) || '').trim();
    if (!localPath || !remotePath) return;
    enqueueTransfer('upload', localPath, remotePath);
  };
  overlay.querySelector('[data-download]').onclick = async () => {
    const remotePath = (window.prompt('Remote source path:', pathInput.value) || '').trim();
    const localPath = (window.prompt('Local destination path:', localPathInput.value) || '').trim();
    if (!localPath || !remotePath) return;
    enqueueTransfer('download', localPath, remotePath);
  };
  overlay.querySelector('[data-mkdir]').onclick = () => runSftpOperation('mkdir', window.prompt('Remote folder name:', `${pathInput.value.replace(/\/+$/, '')}/new-folder`));
  overlay.querySelector('[data-rename]').onclick = () => { const source = window.prompt('Remote source path:', pathInput.value); const target = source && window.prompt('New remote path:', source); return runSftpOperation('rename', source, target); };
  overlay.querySelector('[data-delete]').onclick = () => { const source = window.prompt('Remote file or empty folder path:', pathInput.value); return runSftpOperation('delete', source); };
  overlay.querySelector('[data-chmod]').onclick = () => { const source = window.prompt('Remote path:', pathInput.value); const mode = source && window.prompt('Unix mode (for example 0644):', '0644'); return runSftpOperation('chmod', source, undefined, mode); };
  async function runSftpOperation(operation, path, target = '', mode = '') {
    if (!path) return;
    try { output.textContent = await invoke('sftp_operation', { host, username, port, operation, path, target, mode }); status(`SFTP ${operation} completed`); await invokeList(); }
    catch (error) { output.textContent = String(error); status(`SFTP ${operation} failed: ${error}`, true); }
  }
  await invokeList();
  await invokeLocalList();
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
  if (![ 'local', 'remote', 'dynamic' ].includes(mode)) { status('Tunnel mode must be local, remote, or dynamic', true); return; }
  const host = (window.prompt('SSH gateway host:') || '').trim();
  const username = (window.prompt('SSH username (optional):') || '').trim();
  const sshPort = Number(window.prompt('SSH port:', '22') || '22');
  const bind = (window.prompt(mode === 'dynamic' ? 'SOCKS bind address, e.g. 127.0.0.1:1080:' : 'Bind address, e.g. 127.0.0.1:8080:') || '').trim();
  const target = mode === 'dynamic' ? '' : (window.prompt('Target, e.g. 127.0.0.1:80:') || '').trim();
  if (!host || !Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535 || !bind || (mode !== 'dynamic' && !target)) { status('Tunnel host, valid SSH port, bind address, and target are required', true); return; }
  if (/[\s"'\\]/.test(bind) || /[\s"'\\]/.test(target)) { status('Tunnel bind and target values contain invalid characters', true); return; }
  try {
    const id = await invoke('start_tunnel', { host, username, sshPort, mode, bind, target });
    tunnels.add(id);
    tunnelProfiles = [{ host, username, sshPort, mode, bind, target }, ...tunnelProfiles.filter(profile => JSON.stringify(profile) !== JSON.stringify({ host, username, sshPort, mode, bind, target }))].slice(0, 20);
    localStorage.setItem('moraxterm-tunnel-profiles', JSON.stringify(tunnelProfiles));
    status(`SSH ${mode} tunnel started; click Tunneling to stop`);
  } catch (error) { status(`Tunnel failed: ${error}`, true); }
}

function showSessionChooser() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const types = [['SSH','🔑'],['Telnet','◆'],['Rsh','⚒'],['RDP','▣'],['VNC','◉'],['FTP','◉'],['SFTP','⇅'],['Serial','⌁'],['Shell','>_'],['Browser','◎'],['WSL','▸']];
  overlay.innerHTML = `<section class="chooser-modal"><header><strong>New session</strong><button data-close>×</button></header><div class="session-types">${types.map(([name, icon]) => `<button data-type="${name}"><span>${icon}</span><label>${name}</label></button>`).join('')}</div><div class="chooser-empty"><span>▣</span><strong>Choose a session type…</strong></div><footer><button data-cancel>Cancel</button></footer></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
  overlay.querySelectorAll('[data-type]').forEach(button => button.onclick = () => { const type = button.dataset.type === 'RDP' ? 'Rdp' : button.dataset.type; overlay.remove(); showEditor({ session_type: type, port: type === 'SSH' ? 22 : 0 }); });
}

function showSettings() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="settings-modal"><header><strong>Moraxterm settings</strong><button data-close>×</button></header><nav class="settings-tabs"><button class="active" data-panel="general">◆ General</button><button data-panel="terminal">▣ Terminal</button><button data-panel="x11">⚔ X11</button><button data-panel="ssh">🔑 SSH</button><button data-panel="display">▣ Display</button><button data-panel="toolbar">⚒ Toolbar</button><button data-panel="misc">⚙ Misc</button></nav><div class="settings-panels"><div data-view="general" class="settings-view active"><h3>General</h3><label>Terminal home directory<input value="AppDataDir/Moraxterm/home"></label><label>Terminal root directory<input value="AppDataDir/Moraxterm/root"></label><label>Default text editor<input value="&lt;default&gt;"></label><label class="check"><input type="checkbox" checked> Automatically back up session configuration</label></div><div data-view="terminal" class="settings-view"><h3>Default terminal look and feel</h3><div class="setting-buttons"><button>Default font settings</button><button>Default color settings</button><button>Expert settings</button></div><label>Local shell environment<select><option>Windows shell</option><option>WSL</option><option>Custom executable</option></select></label><label class="check"><input type="checkbox" checked> Cursor blink</label></div><div data-view="x11" class="settings-view"><h3>Server settings</h3><label class="check"><input type="checkbox" checked> Automatically start X server on application startup</label><label>X11 display mode<select><option>Multiwindow mode</option><option>Fullscreen mode</option></select></label><label class="check"><input type="checkbox" checked> Clipboard integration</label></div><div data-view="ssh" class="settings-view"><h3>SSH settings</h3><label class="check"><input type="checkbox" checked> Enable graphical SSH browser</label><label class="check"><input type="checkbox" checked> Remote monitoring</label><label class="check"><input type="checkbox"> Validate host identity at first connection</label><label>SSH keepalive<select><option>Disabled</option><option>30 seconds</option><option>60 seconds</option></select></label></div><div data-view="display" class="settings-view"><h3>Display</h3><label>Interface density<select><option>Compact</option><option>Comfortable</option></select></label><label class="check"><input type="checkbox" checked> Show toolbar labels</label></div><div data-view="toolbar" class="settings-view"><h3>Toolbar</h3><label class="check"><input type="checkbox" checked> Show session toolbar</label><label class="check"><input type="checkbox" checked> Show quick connect bar</label></div><div data-view="misc" class="settings-view"><h3>Miscellaneous</h3><label class="check"><input type="checkbox" checked> Confirm terminal close</label><label class="check"><input type="checkbox"> Start minimized</label></div></div><footer><button data-close>Cancel</button><button class="primary" data-apply>OK</button></footer></section>`;
  document.body.appendChild(overlay);
  const terminalPanel = overlay.querySelector('[data-view="terminal"]');
  terminalPanel?.insertAdjacentHTML('afterbegin', '<label>Application theme<select data-app-theme><option value="mobaxterm">MobaXterm (default)</option><option value="dark">Midnight</option><option value="light">Light</option><option value="amber">Amber terminal</option><option value="neon">Neon terminal</option></select></label><label>Terminal theme<select data-terminal-theme><option value="mobaxterm">MobaXterm</option><option value="dark">Midnight</option><option value="light">Light</option><option value="amber">Amber</option><option value="neon">Neon</option></select></label><label class="check"><input type="checkbox" data-highlight-keywords> Highlight status words in terminal output</label><label>Highlight color<input type="color" data-highlight-color></label>');
  const appTheme = overlay.querySelector('[data-app-theme]');
  const terminalThemeSelect = overlay.querySelector('[data-terminal-theme]');
  const highlightKeywords = overlay.querySelector('[data-highlight-keywords]');
  const highlightColor = overlay.querySelector('[data-highlight-color]');
  if (appTheme) appTheme.value = terminalSettings.appTheme || 'mobaxterm';
  if (terminalThemeSelect) terminalThemeSelect.value = terminalSettings.theme || 'mobaxterm';
  if (highlightKeywords) highlightKeywords.checked = terminalSettings.highlightKeywords !== false;
  if (highlightColor) highlightColor.value = terminalSettings.highlightColor || '#ffd166';
  const miscPanel = overlay.querySelector('[data-view="misc"]');
  if (miscPanel) {
    miscPanel.insertAdjacentHTML('beforeend', `<section class="settings-group debug-settings"><h3>Debug logging</h3><label><input type="checkbox" data-debug-enabled> Enable diagnostic logging</label><label>Log file path<input type="text" data-debug-path placeholder="Default application-data path"></label><p class="muted" data-debug-status>Logging is disabled.</p><button type="button" data-debug-apply>Apply logging settings</button></section>`);
    const enabled = miscPanel.querySelector('[data-debug-enabled]');
    const path = miscPanel.querySelector('[data-debug-path]');
    const status = miscPanel.querySelector('[data-debug-status]');
    const saved = JSON.parse(localStorage.getItem('moraxterm-debug-settings') || '{}');
    enabled.checked = saved.enabled === true;
    path.value = saved.path || '';
    overlay.querySelector('[data-debug-apply]').onclick = async () => {
      try {
        const activePath = await invoke('configure_debug_logging', { enabled: enabled.checked, path: path.value });
        path.value = activePath;
        localStorage.setItem('moraxterm-debug-settings', JSON.stringify({ enabled: enabled.checked, path: activePath }));
        status.textContent = enabled.checked ? `Logging enabled: ${activePath}` : 'Logging disabled.';
      } catch (error) {
        status.textContent = `Could not configure logging: ${error}`;
      }
    };
  }
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  overlay.querySelector('[data-apply]').onclick = () => {
    terminalSettings.appTheme = appTheme?.value || 'mobaxterm';
    terminalSettings.theme = terminalThemeSelect?.value || 'mobaxterm';
    terminalSettings.highlightKeywords = highlightKeywords?.checked !== false;
    terminalSettings.highlightColor = highlightColor?.value || '#ffd166';
    localStorage.setItem('moraxterm-settings', JSON.stringify(terminalSettings));
    applyAppTheme();
    for (const tab of tabs.values()) tab.terminal.options.theme = terminalTheme();
    overlay.remove();
    status(`Theme changed to ${terminalSettings.appTheme}`);
  };
  overlay.querySelectorAll('[data-panel]').forEach(button => button.onclick = () => { overlay.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('active', item === button)); overlay.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === button.dataset.panel)); });
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

function duplicateActive() {
  const id = activeTab();
  const source = id && tabs.get(id)?.session;
  if (!source) { status('Select a terminal tab first', true); return; }
  openTab({ ...source, name: `${source.name} copy` });
  status(`Duplicated ${source.name}`);
}

async function stopMultiExecTarget(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  try {
    if (invoke) await invoke('close_terminal', { id });
    tab.exited = true;
    tab.connectionState = 'exited';
    tab.terminal.options.disableStdin = true;
    tab.terminal.writeln('\r\n\x1b[33m[MultiExec stopped]\x1b[0m');
    status(`Stopped ${tab.session.name}`);
    renderMultiExecManager();
  } catch (error) { status(`Stop failed: ${error}`, true); }
}

function renderMultiExecManager() {
  const overlay = document.querySelector('.multiexec-manager');
  if (!overlay) return;
  const rows = [...tabs.entries()].map(([id, tab]) => `<label class="multiexec-row"><input type="checkbox" data-target-id="${id}" ${multiExecTargets.has(id) ? 'checked' : ''}><span>${iconFor(tab.session.session_type)} ${tab.session.name}</span><small>${tab.connectionState}${tab.exited ? '' : ' · active'}</small><button type="button" data-stop-id="${id}" ${tab.exited ? 'disabled' : ''}>Stop</button></label>`).join('');
  overlay.querySelector('[data-multiexec-list]').innerHTML = rows || '<p>No open terminal sessions.</p>';
  overlay.querySelectorAll('[data-target-id]').forEach(input => input.onchange = () => {
    if (input.checked) multiExecTargets.add(input.dataset.targetId);
    else multiExecTargets.delete(input.dataset.targetId);
    status(`${multiExecTargets.size} MultiExec target${multiExecTargets.size === 1 ? '' : 's'} selected`);
  });
  overlay.querySelectorAll('[data-stop-id]').forEach(button => button.onclick = () => stopMultiExecTarget(button.dataset.stopId));
}

function toggleMultiExec() {
  multiExec = !multiExec;
  const button = document.querySelector('[data-action="multiexec"]');
  button?.classList.toggle('active', multiExec);
  if (!multiExec) {
    multiExecTargets.clear();
    document.querySelector('.multiexec-manager')?.remove();
    status('MultiExec disabled');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay multiexec-manager';
  overlay.innerHTML = `<section class="chooser-modal multiexec-panel"><header><strong>MultiExec targets</strong><button type="button" data-close>×</button></header><p>Select the terminals that should receive typed input. Stop leaves the tab available for reconnect.</p><div data-multiexec-list></div><footer><button type="button" data-select-all>Select all active</button><button type="button" data-clear>Clear</button><button type="button" data-close>Done</button></footer></section>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); };
  overlay.querySelectorAll('[data-close]').forEach(element => element.onclick = close);
  overlay.querySelector('[data-select-all]').onclick = () => { multiExecTargets = new Set([...tabs.entries()].filter(([, tab]) => !tab.exited).map(([id]) => id)); renderMultiExecManager(); };
  overlay.querySelector('[data-clear]').onclick = () => { multiExecTargets.clear(); renderMultiExecManager(); };
  renderMultiExecManager();
  status(`MultiExec enabled for ${tabs.size} open terminals`);
}

function actionMessage(action) {
  if (action === 'split') { splitActive(); return; }
  if (action === 'duplicate') { duplicateActive(); return; }
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

function persistSessionFolders() {
  sessionFolders = [...new Set(sessionFolders.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  localStorage.setItem('moraxterm-session-folders', JSON.stringify(sessionFolders));
}

async function saveChangedSessions(changed) {
  if (!invoke) return;
  for (const session of changed) await invoke('save_session', { session });
}

document.querySelector('#new-folder').onclick = () => {
  const name = prompt('New folder path:', selectedFolder ? `${selectedFolder}/` : '');
  const folder = (name || '').trim().replace(/^[\\/]+|[\\/]+$/g, '');
  if (!folder) return;
  if (sessionFolders.includes(folder)) return status('Folder already exists', true);
  sessionFolders.push(folder);
  persistSessionFolders();
  selectedFolder = folder;
  renderSessions();
  status(`Created folder ${folder}`);
};

document.querySelector('#rename-folder').onclick = async () => {
  if (!selectedFolder) return status('Select a folder first', true);
  const name = prompt('Rename folder:', selectedFolder);
  const next = (name || '').trim().replace(/^[\\/]+|[\\/]+$/g, '');
  if (!next || next === selectedFolder) return;
  if (sessionFolders.some(folder => folder === next || folder.startsWith(`${next}/`))) return status('Folder already exists', true);
  const prefix = `${selectedFolder}/`;
  const changed = sessions.filter(session => session.folder === selectedFolder || session.folder?.startsWith(prefix));
  changed.forEach(session => { session.folder = session.folder === selectedFolder ? next : `${next}/${session.folder.slice(prefix.length)}`; });
  sessionFolders = sessionFolders.map(folder => folder === selectedFolder ? next : folder.startsWith(prefix) ? `${next}/${folder.slice(prefix.length)}` : folder);
  try { await saveChangedSessions(changed); } catch (error) { return status(`Rename failed: ${error}`, true); }
  selectedFolder = next;
  persistSessionFolders();
  renderSessions();
  status(`Renamed folder to ${next}`);
};

document.querySelector('#delete-folder').onclick = async () => {
  if (!selectedFolder) return status('Select a folder first', true);
  if (!confirm(`Delete folder ${selectedFolder}? Sessions will move to its parent.`)) return;
  const parent = selectedFolder.includes('/') ? selectedFolder.slice(0, selectedFolder.lastIndexOf('/')) : '';
  const prefix = `${selectedFolder}/`;
  const changed = sessions.filter(session => session.folder === selectedFolder || session.folder?.startsWith(prefix));
  changed.forEach(session => { session.folder = parent; });
  sessionFolders = sessionFolders.filter(folder => folder !== selectedFolder && !folder.startsWith(prefix));
  try { await saveChangedSessions(changed); } catch (error) { return status(`Delete failed: ${error}`, true); }
  selectedFolder = parent;
  persistSessionFolders();
  renderSessions();
  status(`Deleted folder ${selectedFolder || '(root)'}`);
};

document.querySelector('#search').oninput = renderSessions;
document.querySelector('#export-sessions').onclick = exportSessions;
document.querySelector('#import-backup').onclick = importBackup;
document.querySelector('#import-sessions').onclick = importSessions;
document.querySelector('#new-session').onclick = showSessionChooser;
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

function normalizeTerminalEvent(event) {
  let payload = event?.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return {}; }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function startSftpTransferJob(options, onProgress) {
  return new Promise((resolve, reject) => {
    invoke('start_sftp_transfer', options)
      .then(id => sftpTransferWaiters.set(id, { resolve, reject, onProgress }))
      .catch(reject);
  });
}

if (listen) {
  listen('sftp-transfer-progress', event => {
    const payload = normalizeTerminalEvent(event);
    sftpTransferWaiters.get(payload.id)?.onProgress?.(payload);
  }).catch(error => debugLog('frontend', `sftp-progress listener failed error=${error}`));
  listen('sftp-transfer-exit', event => {
    const payload = normalizeTerminalEvent(event);
    const waiter = sftpTransferWaiters.get(payload.id);
    if (!waiter) return;
    sftpTransferWaiters.delete(payload.id);
    waiter.resolve(payload);
  }).catch(error => debugLog('frontend', `sftp-transfer listener failed error=${error}`));
  listen('terminal-output', event => {
    const payload = normalizeTerminalEvent(event);
    debugLog('frontend', `terminal-output received id=${payload.id || 'missing'} bytes=${String(payload.data || '').length}`);
    const tab = tabs.get(payload.id);
    if (tab) {
      tab.outputSeen = true;
      setTabConnectionState(payload.id, 'connected');
      tab.terminal.write(highlightTerminalText(String(payload.data || '')));
    } else {
      debugLog('frontend', `terminal-output dropped unknown id=${payload.id || 'missing'}`);
    }
  }).then(() => debugLog('frontend', 'terminal-output listener registered')).catch(error => debugLog('frontend', `terminal-output listener failed error=${error}`));
  listen('terminal-exit', event => {
    const payload = normalizeTerminalEvent(event);
    debugLog('frontend', `terminal-exit received id=${payload.id || 'missing'}`);
    const tab = tabs.get(payload.id);
    if (tab) {
      tab.exited = true;
      setTabConnectionState(payload.id, 'exited');
      tab.terminal.options.disableStdin = true;
      tab.terminal.writeln('\r\n\x1b[33mterminal exited; click ↻ to reconnect\x1b[0m');
      status(`Terminal ${payload.id} exited`, true);
    }
  });
}

loadSessions();
