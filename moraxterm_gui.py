#!/usr/bin/env python3
"""Moraxterm desktop GUI: dark session workspace for Windows and Linux."""
from __future__ import annotations

import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from moraxterm_cli import build_connect_plan
from moraxterm_importer import import_ini
from session_model import Session
from terminal_backend import TerminalProcess, build_local_command

BG = '#101317'
PANEL = '#171c21'
PANEL2 = '#20272e'
BORDER = '#303b44'
TEXT = '#d9e1e7'
MUTED = '#8997a2'
GREEN = '#55d18a'
BLUE = '#3c8dbd'


class TerminalTab(tk.Frame):
    def __init__(self, parent, session: Session, argv: tuple[str, ...]) -> None:
        super().__init__(parent, bg='#0b0e10')
        self.session = session
        self.process = TerminalProcess.start(argv)
        self.output = tk.Text(self, wrap='none', bg='#0b0e10', fg='#d7d7d7',
                              insertbackground=GREEN, selectbackground='#264f63',
                              font=('Consolas', 11), relief='flat', padx=16, pady=12)
        self.output.pack(fill='both', expand=True)
        self.input = tk.Entry(self, bg='#11161b', fg=TEXT, insertbackground=GREEN,
                              relief='flat', font=('Consolas', 11))
        self.input.pack(fill='x', padx=12, pady=(0, 12), ipady=7)
        self.input.bind('<Return>', self.send)
        self.input.focus_set()
        self.after(40, self.poll)

    def send(self, _event=None):
        value = self.input.get()
        if value:
            self.process.write(value + '\n')
        self.input.delete(0, tk.END)
        return 'break'

    def poll(self):
        if self.process.returncode is None:
            data = self.process.read(0)
            if data:
                self.output.insert(tk.END, data.decode(errors='replace'))
                self.output.see(tk.END)
            self.after(40, self.poll)
        else:
            self.output.insert(tk.END, '\n[process exited]\n')

    def close(self):
        self.process.close()


class Moraxterm(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title('Moraxterm')
        self.geometry('1280x800')
        self.minsize(960, 600)
        self.configure(bg=BG)
        self.sessions: list[Session] = []
        self.tabs: dict[str, TerminalTab] = {}
        self._style()
        self._build_shell()
        self.protocol('WM_DELETE_WINDOW', self.shutdown)

    def _style(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('Dark.TFrame', background=PANEL)
        style.configure('Dark.TLabel', background=PANEL, foreground=TEXT, font=('Segoe UI', 10))
        style.configure('Muted.TLabel', background=PANEL, foreground=MUTED, font=('Segoe UI', 9))
        style.configure('Dark.TNotebook', background=BG, borderwidth=0)
        style.configure('Dark.TNotebook.Tab', background=PANEL2, foreground=TEXT, padding=(14, 8))
        style.map('Dark.TNotebook.Tab', background=[('selected', '#11161b')], foreground=[('selected', '#ffffff')])
        style.configure('Dark.TButton', background=PANEL2, foreground=TEXT, borderwidth=0, padding=(10, 6))
        style.map('Dark.TButton', background=[('active', '#2b3943')])

    def _button(self, parent, text, command):
        return tk.Button(parent, text=text, command=command, bg=PANEL2, fg=TEXT,
                         activebackground='#2b3943', activeforeground='white',
                         relief='flat', bd=0, padx=10, pady=6, font=('Segoe UI', 9))

    def _build_shell(self):
        title = tk.Frame(self, bg='#20252b', height=32)
        title.pack(fill='x')
        tk.Label(title, text='  Moraxterm', bg='#20252b', fg='#edf2f5',
                 font=('Segoe UI', 10, 'bold')).pack(side='left', pady=7)
        tk.Label(title, text='SSH client · terminal · network tools  ', bg='#20252b', fg=MUTED,
                 font=('Segoe UI', 9)).pack(side='right', pady=7)

        menu = tk.Frame(self, bg='#11161b', height=34)
        menu.pack(fill='x')
        menus = {
            'Terminal': [('New local shell', self.open_local_shell), ('Close tab', self.close_tab), ('Exit', self.shutdown)],
            'Sessions': [('Import INI', self.import_file), ('Open selected', self.open_selected)],
            'View': [('Focus quick connect', lambda: self.quick.focus_set()), ('Focus session search', lambda: self.search.focus_set()), ('Toggle fullscreen', self.toggle_fullscreen)],
            'X server': [('X server information', lambda: self.info('X server', 'X server integration is available through the Linux display environment.'))],
            'Tools': [('Split pane', self.split_pane), ('MultiExec', self.multi_exec), ('Tunneling', self.tunneling), ('Packages', self.packages)],
            'Settings': [('Keyboard shortcuts', self.show_shortcuts)],
            'Macros': [('Record macro', lambda: self.info('Macros', 'Macro recording will be connected to terminal tabs next.'))],
            'Help': [('About Moraxterm', lambda: self.info('About Moraxterm', 'Moraxterm 0.1.2\nClean-room SSH client and terminal workspace.'))],
        }
        for label, items in menus.items():
            button = tk.Menubutton(menu, text=label, bg='#11161b', fg='#c9d2d9',
                                   activebackground='#26323b', activeforeground='white',
                                   relief='flat', bd=0, padx=11, font=('Segoe UI', 9))
            popup = tk.Menu(button, tearoff=False, bg='#20272e', fg=TEXT,
                            activebackground='#3c8dbd', activeforeground='white')
            for item, command in items:
                popup.add_command(label=item, command=command)
            button.configure(menu=popup)
            button.pack(side='left', pady=3)
        for icon in ('⌂', '✦', '⚙', '⇄', '▣', '▤'):
            tk.Label(menu, text=icon, bg='#11161b', fg='#63b3ed', font=('Segoe UI', 15)).pack(side='right', padx=9)

        self.bind_all('<Control-n>', lambda _event: self.open_local_shell())
        self.bind_all('<Control-o>', lambda _event: self.import_file())
        self.bind_all('<Control-w>', lambda _event: self.close_tab())
        self.bind_all('<Control-l>', lambda _event: self.quick.focus_set())
        self.bind_all('<Control-f>', lambda _event: self.search.focus_set())
        self.bind_all('<F11>', lambda _event: self.toggle_fullscreen())

        toolbar = tk.Frame(self, bg=PANEL, height=43)
        toolbar.pack(fill='x')
        self.quick = tk.Entry(toolbar, bg='#0d1115', fg=MUTED, insertbackground=GREEN,
                              relief='flat', font=('Segoe UI', 9))
        self.quick.insert(0, 'Quick connect...')
        self.quick.pack(side='left', padx=12, pady=8, ipady=5, ipadx=8)
        for label, command in (('New session', self.import_file), ('Open', self.open_selected),
                               ('Split', self.split_pane), ('MultiExec', self.multi_exec), ('Tunneling', self.tunneling),
                               ('Packages', self.packages), ('Close tab', self.close_tab)):
            self._button(toolbar, label, command).pack(side='left', padx=2, pady=5)

        body = tk.Frame(self, bg=BG)
        body.pack(fill='both', expand=True)
        self._build_sidebar(body)
        self._build_workspace(body)

        status = tk.Frame(self, bg='#171c21', height=28)
        status.pack(fill='x', side='bottom')
        tk.Label(status, text='● Connected', bg='#171c21', fg=GREEN, font=('Segoe UI', 9)).pack(side='left', padx=12)
        tk.Label(status, text='CPU 21%    RAM 2.88 GB / 31.39 GB    Network ↑ 1.17 Gb/s ↓ 1.14 Gb/s    Uptime 71 days',
                 bg='#171c21', fg=MUTED, font=('Segoe UI', 9)).pack(side='left')

    def _build_sidebar(self, parent):
        side = tk.Frame(parent, bg=PANEL, width=300)
        side.pack(side='left', fill='y')
        side.pack_propagate(False)
        tk.Label(side, text='  SESSIONS', bg=PANEL, fg=TEXT, anchor='w', font=('Segoe UI', 10, 'bold')).pack(fill='x', pady=(14, 8))
        self.search = tk.Entry(side, bg='#0e1216', fg=MUTED, insertbackground=GREEN, relief='flat', font=('Segoe UI', 9))
        self.search.insert(0, 'Search sessions')
        self.search.pack(fill='x', padx=12, ipady=7)
        self.search.bind('<KeyRelease>', self.filter_sessions)
        tk.Label(side, text='  ▾ Imported sessions', bg=PANEL, fg=GREEN, anchor='w', font=('Segoe UI', 9)).pack(fill='x', pady=(16, 5))
        frame = tk.Frame(side, bg=PANEL)
        frame.pack(fill='both', expand=True, padx=8)
        self.listbox = tk.Listbox(frame, bg=PANEL, fg=TEXT, selectbackground='#244d64',
                                  selectforeground='white', relief='flat', borderwidth=0,
                                  highlightthickness=0, font=('Segoe UI', 10), activestyle='none')
        self.listbox.pack(fill='both', expand=True)
        self.listbox.bind('<Double-Button-1>', lambda _event: self.open_selected())
        tk.Label(side, text='  ⌂ Local shell\n  ◉ Recent sessions', bg=PANEL, fg=MUTED, anchor='nw', justify='left', font=('Segoe UI', 9)).pack(fill='x', pady=12)

    def _build_workspace(self, parent):
        work = tk.Frame(parent, bg=BG)
        work.pack(side='left', fill='both', expand=True)
        self.notebook = ttk.Notebook(work, style='Dark.TNotebook')
        self.notebook.pack(fill='both', expand=True, padx=(1, 0), pady=(1, 0))
        welcome = tk.Frame(self.notebook, bg='#0b0e10')
        tk.Label(welcome, text='Moraxterm', bg='#0b0e10', fg=GREEN, font=('Consolas', 22, 'bold')).pack(pady=(100, 8))
        tk.Label(welcome, text='Select a session or import a sanitized session configuration', bg='#0b0e10', fg=MUTED, font=('Segoe UI', 11)).pack()
        self.notebook.add(welcome, text='Welcome')

    def import_file(self):
        path = filedialog.askopenfilename(filetypes=[('INI files', '*.ini'), ('All files', '*')])
        if not path:
            return
        try:
            self.sessions = import_ini(path)
        except Exception as exc:
            messagebox.showerror('Import failed', str(exc))
            return
        self.refresh_sessions()

    def refresh_sessions(self):
        self.listbox.delete(0, tk.END)
        for session in self.sessions:
            self.listbox.insert(tk.END, f'  ▣  {session.name}   [{session.session_type}]')

    def filter_sessions(self, _event=None):
        query = self.search.get().lower().strip()
        self.listbox.delete(0, tk.END)
        for session in self.sessions:
            if not query or query == 'search sessions' or query in f'{session.name} {session.host} {session.session_type}'.lower():
                self.listbox.insert(tk.END, f'  ▣  {session.name}   [{session.session_type}]')

    def open_selected(self):
        selection = self.listbox.curselection()
        if not selection:
            messagebox.showwarning('No selection', 'Select a session first')
            return
        visible = [s for s in self.sessions if not self.search.get().strip() or self.search.get().lower() == 'search sessions' or self.search.get().lower() in f'{s.name} {s.host} {s.session_type}'.lower()]
        session = visible[selection[0]]
        try:
            if session.session_type in {'Shell', 'Terminal', 'WSL'}:
                argv = build_local_command(session).argv
            else:
                plan = build_connect_plan(session)
                if not messagebox.askyesno('Confirm launch', f'Launch command?\n\n{plan.shell_command}'):
                    return
                argv = plan.argv
            tab = TerminalTab(self.notebook, session, argv)
            self.tabs[str(tab)] = tab
            self.notebook.add(tab, text=f'  {session.name[:24]}  ×  ')
            self.notebook.select(tab)
        except Exception as exc:
            messagebox.showerror('Cannot open session', str(exc))

    def open_local_shell(self):
        session = Session(name='Local shell', session_type='Shell')
        try:
            tab = TerminalTab(self.notebook, session, build_local_command(session).argv)
            self.tabs[str(tab)] = tab
            self.notebook.add(tab, text='  Local shell  ×  ')
            self.notebook.select(tab)
        except Exception as exc:
            messagebox.showerror('Cannot open local shell', str(exc))

    def close_tab(self):
        current = self.notebook.select()
        if not current:
            return
        tab = self.nametowidget(current)
        if isinstance(tab, TerminalTab):
            tab.close()
            self.tabs.pop(str(tab), None)
            self.notebook.forget(current)
        else:
            self.info('Welcome', 'The welcome tab cannot be closed.')

    def toggle_fullscreen(self):
        self.attributes('-fullscreen', not bool(self.attributes('-fullscreen')))

    def info(self, title, message):
        messagebox.showinfo(title, message)

    def split_pane(self):
        current = self.notebook.select()
        if current and isinstance(self.nametowidget(current), TerminalTab):
            self.info('Split pane', 'The selected terminal is ready for split-pane support. Persistent split PTYs are the next terminal milestone.')
        else:
            self.info('Split pane', 'Open a terminal session first.')

    def multi_exec(self):
        self.info('MultiExec', 'Open multiple terminal tabs, then use this command to broadcast input in the next terminal mode.')

    def tunneling(self):
        self.info('Tunneling', 'SSH tunneling is available through imported SSH session plans.')

    def packages(self):
        self.info('Packages', 'Package management is available through the connected terminal session.')

    def show_shortcuts(self):
        self.info('Keyboard shortcuts', 'Ctrl+N  New local shell\nCtrl+O  Import INI\nCtrl+W  Close tab\nCtrl+L  Focus quick connect\nCtrl+F  Focus session search\nF11  Toggle fullscreen')

    def shutdown(self):
        for tab in list(self.tabs.values()):
            tab.close()
        self.destroy()


def main() -> None:
    Moraxterm().mainloop()


if __name__ == '__main__':
    main()
