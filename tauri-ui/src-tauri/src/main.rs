use moraxterm_core::{SessionStore, TerminalProcess};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct TerminalManager {
    processes: Mutex<HashMap<String, Arc<Mutex<TerminalProcess>>>>,
}

#[derive(Clone, Serialize)]
struct TerminalEvent {
    id: String,
    data: String,
}

#[tauri::command]
fn list_sessions() -> Result<Vec<moraxterm_core::Session>, String> {
    let path = dirs::home_dir().ok_or("home directory unavailable")?.join(".local/share/moraxterm-linux/sessions.sqlite3");
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?).map_err(|e| e.to_string())?;
    store.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_sessions(path: String) -> Result<usize, String> {
    let text = fs::read_to_string(&path).map_err(|e| format!("cannot read import file: {e}"))?;
    let mut imported = moraxterm_core::import_ini(&text).map_err(|e| e.to_string())?;
    imported.extend(moraxterm_core::import_bookmarks(&text).map_err(|e| e.to_string())?);
    let mut unique = HashMap::new();
    for session in imported { unique.insert(session.name.clone(), session); }
    let db_path = dirs::home_dir().ok_or("home directory unavailable")?.join(".local/share/moraxterm-linux/sessions.sqlite3");
    let store = SessionStore::open(db_path.to_str().ok_or("invalid database path")?).map_err(|e| e.to_string())?;
    for session in unique.values() { store.upsert(session).map_err(|e| e.to_string())?; }
    Ok(unique.len())
}

#[tauri::command]
fn save_session(session: moraxterm_core::Session) -> Result<(), String> {
    if session.name.trim().is_empty() { return Err("session name cannot be empty".into()); }
    let path = dirs::home_dir().ok_or("home directory unavailable")?.join(".local/share/moraxterm-linux/sessions.sqlite3");
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?).map_err(|e| e.to_string())?;
    store.upsert(&session).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(name: String) -> Result<bool, String> {
    let path = dirs::home_dir().ok_or("home directory unavailable")?.join(".local/share/moraxterm-linux/sessions.sqlite3");
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?).map_err(|e| e.to_string())?;
    store.delete(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_terminal(app: AppHandle, state: State<'_, TerminalManager>, id: String, session: Option<moraxterm_core::Session>, program: Option<String>) -> Result<(), String> {
    let (program_name, args): (String, Vec<String>) = if let Some(program) = program {
        (program, Vec::new())
    } else if let Some(session) = session.as_ref().filter(|value| value.session_type.eq_ignore_ascii_case("SSH")) {
        if session.host.trim().is_empty() || session.username.trim().is_empty() || session.port == 0 { return Err("SSH session requires host, username, and a valid port".into()); }
        ("ssh".into(), vec!["-p".into(), session.port.to_string(), format!("{}@{}", session.username, session.host)])
    } else if let Some(session) = session.as_ref().filter(|value| value.session_type.eq_ignore_ascii_case("Rdp")) {
        if session.host.trim().is_empty() || session.port == 0 { return Err("RDP session requires host and a valid port".into()); }
        let mut args = vec![format!("/v:{}:{}", session.host, session.port)];
        if !session.username.trim().is_empty() { args.push(format!("/u:{}", session.username)); }
        (if cfg!(windows) { "xfreerdp.exe".into() } else { "xfreerdp".into() }, args)
    } else if let Some(session) = session.as_ref().filter(|value| value.session_type.eq_ignore_ascii_case("Vnc")) {
        if session.host.trim().is_empty() || session.port == 0 { return Err("VNC session requires host and a valid port".into()); }
        (if cfg!(windows) { "vncviewer.exe".into() } else { "vncviewer".into() }, vec![format!("{}:{}", session.host, session.port)])
    } else if let Some(session) = session.as_ref().filter(|value| value.session_type.eq_ignore_ascii_case("WSL")) {
        if session.host.trim().is_empty() { return Err("WSL session requires a distribution name".into()); }
        (if cfg!(windows) { "wsl.exe".into() } else { "wsl".into() }, vec!["-d".into(), session.host.clone()])
    } else if cfg!(windows) {
        ("cmd.exe".into(), vec!["/Q".into(), "/K".into()])
    } else {
        ("/bin/sh".into(), vec!["-l".into()])
    };
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let process = TerminalProcess::spawn(&program_name, &arg_refs).map_err(|e| e.to_string())?;
    let shared = Arc::new(Mutex::new(process));
    state.processes.lock().map_err(|_| "terminal manager poisoned")?.insert(id.clone(), Arc::clone(&shared));
    std::thread::spawn(move || loop {
        let result = shared.lock().map_err(|_| "terminal poisoned".to_string()).and_then(|mut process| process.read_chunk().map_err(|e| e.to_string()));
        match result {
            Ok(data) if !data.is_empty() => {
                let event = TerminalEvent { id: id.clone(), data: String::from_utf8_lossy(&data).into_owned() };
                let _ = app.emit("terminal-output", event);
            }
            _ => {
                let _ = app.emit("terminal-exit", TerminalEvent { id: id.clone(), data: String::new() });
                break;
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn write_terminal(state: State<'_, TerminalManager>, id: String, data: String) -> Result<(), String> {
    let process = state.processes.lock().map_err(|_| "terminal manager poisoned")?.get(&id).cloned().ok_or("terminal not found")?;
    let result = process.lock().map_err(|_| "terminal poisoned")?.write(data.as_bytes()).map_err(|e| e.to_string());
    result
}

#[tauri::command]
fn close_terminal(state: State<'_, TerminalManager>, id: String) -> Result<(), String> {
    let process = state.processes.lock().map_err(|_| "terminal manager poisoned")?.remove(&id);
    if let Some(process) = process {
        process.lock().map_err(|_| "terminal poisoned")?.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn run_terminal_command(command: String) -> Result<String, String> {
    if command.trim().is_empty() { return Ok(String::new()); }
    let (program, args): (&str, Vec<&str>) = if cfg!(windows) {
        ("cmd.exe", vec!["/C", command.as_str()])
    } else {
        ("/bin/sh", vec!["-lc", command.as_str()])
    };
    let mut process = TerminalProcess::spawn(program, &args).map_err(|e| e.to_string())?;
    let output = process.read_to_end().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalManager::default())
        .invoke_handler(tauri::generate_handler![list_sessions, import_sessions, save_session, delete_session, start_terminal, write_terminal, close_terminal, run_terminal_command])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

fn main() { run(); }
