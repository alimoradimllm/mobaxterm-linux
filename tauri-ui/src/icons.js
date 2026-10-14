const icons = {
  SSH: ['#ffd166', '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="4" y="10" width="16" height="10" rx="2"/><circle cx="12" cy="15" r="1"/>'],
  Telnet: ['#64c98a', '<path d="M5 5h14v14H5z"/><path d="m8 9 3 3-3 3M13 15h3"/>'],
  Rdp: ['#64b5f6', '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  Vnc: ['#ff8a65', '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>'],
  WSL: ['#b39ddb', '<path d="m5 7 5 5-5 5M12 17h7"/>'],
  Shell: ['#90caf9', '<path d="M4 5h16v14H4z"/><path d="m7 9 3 3-3 3M12 15h4"/>'],
  Serial: ['#ffcc80', '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>'],
};

export const protocolIconTypes = Object.freeze(Object.keys(icons));

export function iconFor(type) {
  const [color, body] = icons[type] || icons.Shell;
  return `<svg class="protocol-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
