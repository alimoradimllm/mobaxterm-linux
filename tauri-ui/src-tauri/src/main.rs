use mobaxterm_core::{SessionStore, TerminalProcess};

#[tauri::command]
fn list_sessions() -> Result<Vec<mobaxterm_core::Session>, String> {
    let path = dirs::home_dir().ok_or("home directory unavailable")?.join(".local/share/mobaxterm-linux/sessions.sqlite3");
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?).map_err(|e| e.to_string())?;
    store.list().map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![list_sessions, run_terminal_command])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

fn main() { run(); }
