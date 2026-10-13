#!/usr/bin/env python3
"""Tabbed Tk session browser with PTY-backed terminal tabs."""
from __future__ import annotations

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from moraxterm_cli import build_connect_plan
from moraxterm_importer import import_ini
from session_model import Session
from terminal_backend import TerminalProcess, build_local_command


class TerminalTab(ttk.Frame):
    def __init__(self, parent, session: Session, argv: tuple[str, ...]) -> None:
        super().__init__(parent)
        self.process = TerminalProcess.start(argv)
        self.output = tk.Text(self, wrap='none', bg='#111827', fg='#e5e7eb', insertbackground='white')
        self.output.pack(fill='both', expand=True)
        self.input = ttk.Entry(self)
        self.input.pack(fill='x')
        self.input.bind('<Return>', self.send)
        self.input.focus_set()
        self.after(30, self.poll)

    def send(self, _event=None):
        value = self.input.get()
        self.process.write(value + '\n')
        self.input.delete(0, tk.END)
        return 'break'

    def poll(self):
        if self.process.returncode is None:
            data = self.process.read(0)
            if data:
                self.output.insert(tk.END, data.decode(errors='replace'))
                self.output.see(tk.END)
            self.after(30, self.poll)
        else:
            self.output.insert(tk.END, '\n[process exited]\n')

    def close(self):
        self.process.close()


class SessionBrowser(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title('Moraxterm')
        self.geometry('1100x700')
        self.sessions: list[Session] = []
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill='both', expand=True)
        bar = ttk.Frame(self)
        bar.pack(fill='x')
        ttk.Button(bar, text='Import INI', command=self.import_file).pack(side='left')
        ttk.Button(bar, text='Open selected', command=self.open_selected).pack(side='left', padx=5)
        ttk.Button(bar, text='Close tab', command=self.close_tab).pack(side='left')
        self.listbox = tk.Listbox(bar, height=5, width=80)
        self.listbox.pack(side='left', fill='x', expand=True, padx=8)
        self.protocol('WM_DELETE_WINDOW', self.shutdown)

    def import_file(self) -> None:
        path = filedialog.askopenfilename(filetypes=[('INI files', '*.ini'), ('All files', '*')])
        if not path:
            return
        try:
            self.sessions = import_ini(path)
        except Exception as exc:
            messagebox.showerror('Import failed', str(exc))
            return
        self.listbox.delete(0, tk.END)
        for session in self.sessions:
            self.listbox.insert(tk.END, f'{session.name} [{session.session_type}] {session.host or ""}')

    def open_selected(self) -> None:
        selection = self.listbox.curselection()
        if not selection:
            messagebox.showwarning('No selection', 'Select a session first')
            return
        session = self.sessions[selection[0]]
        try:
            if session.session_type in {'Shell', 'Terminal', 'WSL'}:
                argv = build_local_command(session).argv
            else:
                plan = build_connect_plan(session)
                if not messagebox.askyesno('Confirm launch', f'Launch command?\n\n{plan.shell_command}'):
                    return
                argv = plan.argv
            tab = TerminalTab(self.notebook, session, argv)
            self.notebook.add(tab, text=session.name[:30])
            self.notebook.select(tab)
        except Exception as exc:
            messagebox.showerror('Cannot open session', str(exc))

    def close_tab(self) -> None:
        current = self.notebook.select()
        if not current:
            return
        tab = self.nametowidget(current)
        if hasattr(tab, 'close'):
            tab.close()
        self.notebook.forget(current)

    def shutdown(self) -> None:
        for child in self.notebook.winfo_children():
            if hasattr(child, 'close'):
                child.close()
        self.destroy()


def main() -> None:
    SessionBrowser().mainloop()


if __name__ == '__main__':
    main()
