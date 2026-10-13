import './style.css';

const tabs = [];
const app = document.querySelector('#app');
app.innerHTML = `
  <header><strong>MobaXterm Linux</strong><button id="import">Import sessions</button><input id="search" placeholder="Search sessions"></header>
  <main><aside><ul id="sessions"></ul></aside><section><nav id="tabs"></nav><div id="panes"></div></section></main>`;

const sessionsEl = document.querySelector('#sessions');
const tabsEl = document.querySelector('#tabs');
const panesEl = document.querySelector('#panes');
let sessions = [];

function renderSessions() {
  const query = document.querySelector('#search').value.toLowerCase();
  sessionsEl.innerHTML = '';
  sessions.filter(s => JSON.stringify(s).toLowerCase().includes(query)).forEach((session, index) => {
    const item = document.createElement('li');
    item.textContent = `${session.name} [${session.session_type}] ${session.host || ''}`;
    item.onclick = () => openTab(session, index);
    sessionsEl.appendChild(item);
  });
}

function openTab(session, index) {
  const id = `tab-${Date.now()}-${index}`;
  tabs.push({ id, session });
  const tab = document.createElement('button');
  tab.textContent = session.name;
  tab.onclick = () => activate(id);
  tab.dataset.id = id;
  tabsEl.appendChild(tab);
  const pane = document.createElement('div');
  pane.className = 'terminal-pane'; pane.dataset.id = id;
  pane.innerHTML = `<div class="terminal-output">Ready: ${session.session_type} ${session.host || ''}</div><input placeholder="Command or input" />`;
  pane.querySelector('input').onkeydown = async event => {
    if (event.key === 'Enter') {
      const command = event.target.value;
      pane.querySelector('.terminal-output').textContent += `\n> ${command}`;
      event.target.value = '';
      if (window.__TAURI__?.core?.invoke) {
        try {
          const output = await window.__TAURI__.core.invoke('run_terminal_command', { command });
          pane.querySelector('.terminal-output').textContent += `\n${output}`;
        } catch (error) {
          pane.querySelector('.terminal-output').textContent += `\n[error] ${error}`;
        }
      }
    }
  };
  panesEl.appendChild(pane); activate(id);
}

function activate(id) {
  document.querySelectorAll('[data-id]').forEach(el => el.classList.toggle('active', el.dataset.id === id));
}

document.querySelector('#search').oninput = renderSessions;
document.querySelector('#import').onclick = async () => {
  if (window.__TAURI__?.core?.invoke) sessions = await window.__TAURI__.core.invoke('list_sessions');
  else sessions = [{name: 'Rust core', session_type: 'SSH', host: 'import sessions through the CLI'}];
  renderSessions();
};
renderSessions();
