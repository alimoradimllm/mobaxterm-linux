#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use moraxterm_core::{SessionStore, TerminalProcess};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct TerminalManager {
    processes: Arc<Mutex<HashMap<String, Arc<Mutex<TerminalProcess>>>>>,
    recordings: Arc<Mutex<HashMap<String, File>>>,
    sftp_jobs: Arc<Mutex<HashMap<String, Child>>>,
    debug: Arc<Mutex<DebugConfig>>,
}

struct DebugConfig {
    enabled: bool,
    path: PathBuf,
    file: Option<File>,
}

impl Default for DebugConfig {
    fn default() -> Self {
        let path = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Moraxterm")
            .join("moraxterm-debug.log");
        Self {
            enabled: false,
            path,
            file: None,
        }
    }
}

#[derive(Default)]
struct TunnelManager {
    processes: Mutex<HashMap<String, Child>>,
}

#[derive(Clone, Serialize)]
struct TerminalEvent {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct SftpTransferEvent {
    id: String,
    success: bool,
    message: String,
    transferred_bytes: Option<u64>,
    total_bytes: Option<u64>,
}

fn debug_write(logger: &Arc<Mutex<DebugConfig>>, component: &str, message: &str) {
    let Ok(mut config) = logger.lock() else {
        return;
    };
    if !config.enabled {
        return;
    }
    if let Some(parent) = config.path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if config.file.is_none() {
        config.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&config.path)
            .ok();
    }
    if let Some(file) = config.file.as_mut() {
        let _ = writeln!(
            file,
            "{} [{}] {}",
            chrono_like_timestamp(),
            component,
            message
                .replace("password", "[REDACTED]")
                .replace("private_key", "[REDACTED]")
        );
        let _ = file.flush();
    }
}

fn credential_entry(service: &str, account: &str) -> Result<keyring::Entry, String> {
    let service = service.trim();
    let account = account.trim();
    if service.is_empty() || account.is_empty() || service.len() > 128 || account.len() > 256 {
        return Err("credential service and account are required".into());
    }
    keyring::Entry::new(service, account)
        .map_err(|error| format!("credential store unavailable: {error}"))
}

#[tauri::command]
fn credential_status(service: String, account: String) -> Result<bool, String> {
    let entry = credential_entry(&service, &account)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("credential lookup failed: {error}")),
    }
}

#[tauri::command]
fn ssh_agent_status() -> Result<String, String> {
    let output = if cfg!(windows) {
        Command::new("ssh-add").arg("-l").output()
    } else {
        Command::new("ssh-add").arg("-l").output()
    };
    match output {
        Ok(result) if result.status.success() => {
            let count = String::from_utf8_lossy(&result.stdout)
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count();
            Ok(format!("agent available ({count} identities)"))
        }
        Ok(result) => {
            let message = String::from_utf8_lossy(&result.stderr).to_lowercase();
            if message.contains("no identities") {
                Ok("agent available (no identities)".into())
            } else if message.contains("could not open a connection")
                || message.contains("connect to agent")
            {
                Ok("agent unavailable".into())
            } else {
                Ok("agent check failed".into())
            }
        }
        Err(error) => Err(format!("ssh-agent check unavailable: {error}")),
    }
}

#[tauri::command]
fn credential_store(service: String, account: String, secret: String) -> Result<(), String> {
    if secret.is_empty() {
        return Err("credential cannot be empty".into());
    }
    credential_entry(&service, &account)?
        .set_password(&secret)
        .map_err(|error| format!("credential save failed: {error}"))
}

#[tauri::command]
fn credential_delete(service: String, account: String) -> Result<bool, String> {
    let entry = credential_entry(&service, &account)?;
    match entry.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("credential delete failed: {error}")),
    }
}

fn create_ssh_askpass(secret: &str) -> Result<std::path::PathBuf, String> {
    let suffix = chrono_like_timestamp().replace('.', "-");
    let path = std::env::temp_dir().join(if cfg!(windows) {
        format!("moraxterm-askpass-{suffix}.cmd")
    } else {
        format!("moraxterm-askpass-{suffix}.sh")
    });
    let content = if cfg!(windows) {
        "@echo off\r\necho %MORAXTERM_SSH_SECRET%\r\n"
    } else {
        "#!/bin/sh\nprintf '%s\\n' \"$MORAXTERM_SSH_SECRET\"\n"
    };
    std::fs::write(&path, content)
        .map_err(|error| format!("cannot create askpass helper: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&path, permissions).map_err(|error| error.to_string())?;
    }
    let _ = secret;
    Ok(path)
}

fn chrono_like_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", now.as_secs(), now.subsec_millis())
}

#[tauri::command]
fn configure_debug_logging(
    state: State<'_, TerminalManager>,
    enabled: bool,
    path: String,
) -> Result<String, String> {
    let mut config = state.debug.lock().map_err(|_| "debug logger poisoned")?;
    let requested = if path.trim().is_empty() {
        config.path.clone()
    } else {
        PathBuf::from(path.trim())
    };
    if enabled {
        if let Some(parent) = requested.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        config.file = Some(
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(&requested)
                .map_err(|e| e.to_string())?,
        );
    } else {
        config.file = None;
    }
    config.path = requested.clone();
    config.enabled = enabled;
    if let Some(file) = config.file.as_mut() {
        let _ = writeln!(
            file,
            "{} [debug] logging {}",
            chrono_like_timestamp(),
            if enabled { "enabled" } else { "disabled" }
        );
    }
    Ok(requested.to_string_lossy().into_owned())
}

#[tauri::command]
fn debug_log(
    state: State<'_, TerminalManager>,
    component: String,
    message: String,
) -> Result<(), String> {
    debug_write(&state.debug, &component, &message);
    Ok(())
}

#[tauri::command]
fn debug_log_path(state: State<'_, TerminalManager>) -> Result<String, String> {
    Ok(state
        .debug
        .lock()
        .map_err(|_| "debug logger poisoned")?
        .path
        .to_string_lossy()
        .into_owned())
}
fn session_database_path() -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        dirs::data_dir()
            .ok_or("application data directory unavailable")?
            .join("Moraxterm")
    } else {
        dirs::home_dir()
            .ok_or("home directory unavailable")?
            .join(".local/share/moraxterm-linux")
    };
    fs::create_dir_all(&base).map_err(|e| format!("cannot create session directory: {e}"))?;
    Ok(base.join("sessions.sqlite3"))
}

#[tauri::command]
fn list_sessions() -> Result<Vec<moraxterm_core::Session>, String> {
    let path = session_database_path()?;
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    store.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_sessions(path: String) -> Result<usize, String> {
    let text = fs::read_to_string(&path).map_err(|e| format!("cannot read import file: {e}"))?;
    let mut imported = moraxterm_core::import_ini(&text).map_err(|e| e.to_string())?;
    imported.extend(moraxterm_core::import_bookmarks(&text).map_err(|e| e.to_string())?);
    let mut unique = HashMap::new();
    for session in imported {
        unique.insert(session.name.clone(), session);
    }
    let db_path = session_database_path()?;
    let store = SessionStore::open(db_path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    for session in unique.values() {
        store.upsert(session).map_err(|e| e.to_string())?;
    }
    Ok(unique.len())
}

#[tauri::command]
fn save_session(session: moraxterm_core::Session) -> Result<(), String> {
    if session.name.trim().is_empty() {
        return Err("session name cannot be empty".into());
    }
    let path = session_database_path()?;
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    store.upsert(&session).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(name: String) -> Result<bool, String> {
    let path = session_database_path()?;
    let store = SessionStore::open(path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    store.delete(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_sessions(path: String) -> Result<usize, String> {
    if path.trim().is_empty() {
        return Err("export path cannot be empty".into());
    }
    let db_path = session_database_path()?;
    let store = SessionStore::open(db_path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    let sessions = store.list().map_err(|e| e.to_string())?;
    let sanitized: Vec<_> = sessions.into_iter().map(sanitize_session).collect();
    fs::write(
        &path,
        serde_json::to_vec_pretty(&sanitized).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(sanitized.len())
}

#[tauri::command]
fn import_backup(path: String) -> Result<usize, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let sessions: Vec<moraxterm_core::Session> =
        serde_json::from_slice(&data).map_err(|e| format!("invalid session backup: {e}"))?;
    let db_path = session_database_path()?;
    let store = SessionStore::open(db_path.to_str().ok_or("invalid database path")?)
        .map_err(|e| e.to_string())?;
    for session in &sessions {
        if session.name.trim().is_empty() {
            continue;
        }
        let clean = sanitize_session(session.clone());
        store.upsert(&clean).map_err(|e| e.to_string())?;
    }
    Ok(sessions
        .iter()
        .filter(|s| !s.name.trim().is_empty())
        .count())
}

fn sanitize_session(mut session: moraxterm_core::Session) -> moraxterm_core::Session {
    session.environment.retain(|key, _| {
        ![
            "password",
            "passphrase",
            "secret",
            "token",
            "key",
            "private",
        ]
        .iter()
        .any(|word| key.to_ascii_lowercase().contains(word))
    });
    let startup = session.startup_command.to_ascii_lowercase();
    if [
        "password",
        "passphrase",
        "secret",
        "token",
        "private_key",
        "apikey",
    ]
    .iter()
    .any(|word| startup.contains(word))
    {
        session.startup_command.clear();
    }
    session
}

#[tauri::command]
fn start_tunnel(
    state: State<'_, TunnelManager>,
    host: String,
    username: String,
    ssh_port: u16,
    mode: String,
    bind: String,
    target: String,
) -> Result<String, String> {
    if host.trim().is_empty() || bind.trim().is_empty() || ssh_port == 0 {
        return Err("tunnel host, bind address, and a valid SSH port are required".into());
    }
    let mode = mode.to_ascii_lowercase();
    if host
        .chars()
        .any(|c| c.is_control() || c == '"' || c == '\'')
        || bind
            .chars()
            .any(|c| c.is_control() || c == '"' || c == '\'')
        || target
            .chars()
            .any(|c| c.is_control() || c == '"' || c == '\'')
    {
        return Err("tunnel values contain invalid characters".into());
    }
    if !["local", "remote", "dynamic"].contains(&mode.as_str()) {
        return Err("tunnel mode must be local, remote, or dynamic".into());
    }
    if mode != "dynamic" && target.trim().is_empty() {
        return Err("local and remote tunnels require a target".into());
    }
    let forward = match mode.as_str() {
        "local" => format!("{}:{}", bind, target),
        "remote" => format!("{}:{}", bind, target),
        _ => bind.clone(),
    };
    let mut command = std::process::Command::new(if cfg!(windows) { "ssh.exe" } else { "ssh" });
    command.arg("-N").arg("-p").arg(ssh_port.to_string());
    command
        .arg(if mode == "local" {
            "-L"
        } else if mode == "remote" {
            "-R"
        } else {
            "-D"
        })
        .arg(forward);
    command.arg(if username.trim().is_empty() {
        host.clone()
    } else {
        format!("{}@{}", username, host)
    });
    let child = command
        .spawn()
        .map_err(|e| format!("cannot start ssh tunnel: {e}"))?;
    let id = format!(
        "tunnel-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    );
    state
        .processes
        .lock()
        .map_err(|_| "tunnel manager poisoned")?
        .insert(id.clone(), child);
    Ok(id)
}

#[tauri::command]
fn stop_tunnel(state: State<'_, TunnelManager>, id: String) -> Result<bool, String> {
    let child = state
        .processes
        .lock()
        .map_err(|_| "tunnel manager poisoned")?
        .remove(&id);
    if let Some(mut child) = child {
        child.kill().map_err(|e| e.to_string())?;
        let _ = child.wait();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn xserver_status() -> Result<String, String> {
    let display = std::env::var("DISPLAY").unwrap_or_else(|_| "not set".into());
    let session = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".into());
    let probe = if cfg!(windows) {
        std::process::Command::new("where.exe")
            .args(["vcxsrv.exe", "Xming.exe"])
            .output()
    } else {
        std::process::Command::new("sh")
            .args([
                "-lc",
                "command -v Xwayland || command -v Xorg || command -v Xvfb",
            ])
            .output()
    }
    .map_err(|e| e.to_string())?;
    let binaries = String::from_utf8_lossy(&probe.stdout).trim().to_string();
    Ok(format!(
        "DISPLAY={display}\nSession={session}\nX server binary={} ",
        if binaries.is_empty() {
            "not found"
        } else {
            &binaries
        }
    ))
}

#[tauri::command]
fn local_list(path: String) -> Result<String, String> {
    if path.trim().is_empty()
        || path
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid local path".into());
    }
    let directory = PathBuf::from(path.trim());
    let metadata =
        fs::metadata(&directory).map_err(|e| format!("cannot access local path: {e}"))?;
    if !metadata.is_dir() {
        return Err("local path is not a directory".into());
    }
    let mut entries = fs::read_dir(&directory)
        .map_err(|e| format!("cannot list local path: {e}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let kind = entry
                .file_type()
                .map(|value| if value.is_dir() { "DIR" } else { "FILE" })
                .unwrap_or("UNKNOWN");
            let file_metadata = entry.metadata().ok();
            let size = file_metadata.as_ref().map(|value| value.len()).unwrap_or(0);
            let modified = file_metadata
                .and_then(|value| value.modified().ok())
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_secs())
                .unwrap_or(0);
            Some((name, kind.to_string(), size, modified))
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });
    let mut output = format!(
        "LOCAL PATH: {}\nTYPE    SIZE(bytes)  MODIFIED(epoch)  NAME\n",
        directory.display()
    );
    for (name, kind, size, modified) in entries {
        output.push_str(&format!("{kind:7} {size:11} {modified:15}  {name}\n"));
    }
    Ok(output)
}

#[tauri::command]
fn local_preview(path: String) -> Result<String, String> {
    if path.trim().is_empty()
        || path
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid local preview path".into());
    }
    let data = fs::read(path.trim()).map_err(|e| format!("cannot read local file: {e}"))?;
    if data.len() > 1_048_576 {
        return Err("local preview is limited to 1 MiB".into());
    }
    String::from_utf8(data).map_err(|_| "local preview supports UTF-8 text files only".into())
}

#[tauri::command]
fn local_write_text(path: String, content: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty()
        || path
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid local text path".into());
    }
    if content.len() > 1_048_576 {
        return Err("local text editor is limited to 1 MiB".into());
    }
    if !std::path::Path::new(path).is_file() {
        return Err("local text file does not exist".into());
    }
    fs::write(path, content).map_err(|e| format!("cannot save local text file: {e}"))
}

#[tauri::command]
fn open_local_path(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty()
        || path
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid local path".into());
    }
    if !std::path::Path::new(path).exists() {
        return Err("local file does not exist".into());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|e| format!("cannot open local file: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("cannot open local file: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("cannot open local file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn shell_available(shell: String) -> bool {
    let normalized = shell.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "default" || normalized == "system" {
        return true;
    }
    let executable = match normalized.as_str() {
        "cmd" => {
            if cfg!(windows) {
                "cmd.exe"
            } else {
                "sh"
            }
        }
        "powershell" => {
            if cfg!(windows) {
                "powershell.exe"
            } else {
                "powershell"
            }
        }
        "bash" => {
            if cfg!(windows) {
                "bash.exe"
            } else {
                "bash"
            }
        }
        "fish" => {
            if cfg!(windows) {
                "fish.exe"
            } else {
                "fish"
            }
        }
        "zsh" => {
            if cfg!(windows) {
                "zsh.exe"
            } else {
                "zsh"
            }
        }
        "nu" | "nushell" => {
            if cfg!(windows) {
                "nu.exe"
            } else {
                "nu"
            }
        }
        _ => return false,
    };
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|directory| directory.join(executable).is_file())
}

#[derive(Serialize)]
struct WslDistribution {
    name: String,
    state: String,
    version: String,
}

#[tauri::command]
fn wsl_distributions() -> Result<Vec<WslDistribution>, String> {
    if !cfg!(windows) {
        return Err("WSL distribution discovery is only available on Windows".into());
    }
    let output = Command::new("wsl.exe")
        .args(["--list", "--quiet"])
        .output()
        .map_err(|e| format!("cannot run wsl.exe: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = if output.stdout.contains(&0) {
        let units = output
            .stdout
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(&output.stdout).into_owned()
    };
    let values = text
        .lines()
        .filter_map(|line| {
            let line = line.trim_matches('\u{feff}').trim();
            if line.is_empty() || line.to_ascii_uppercase().starts_with("NAME") {
                return None;
            }
            let fields = line
                .trim_start_matches('*')
                .split_whitespace()
                .collect::<Vec<_>>();
            let name = fields.first()?.to_string();
            let state = fields.get(1).unwrap_or(&"Unknown").to_string();
            let version = fields.get(2).unwrap_or(&"?").to_string();
            Some(WslDistribution {
                name,
                state,
                version,
            })
        })
        .collect::<Vec<_>>();
    Ok(values)
}

#[tauri::command]
fn protocol_client_available(protocol: String) -> bool {
    let executable = match protocol.trim().to_ascii_lowercase().as_str() {
        "rdp" => {
            if cfg!(windows) {
                "mstsc.exe"
            } else {
                "xfreerdp"
            }
        }
        "vnc" => {
            if cfg!(windows) {
                "vncviewer.exe"
            } else {
                "vncviewer"
            }
        }
        _ => return false,
    };
    if cfg!(windows) && protocol.trim().eq_ignore_ascii_case("rdp") {
        return std::path::Path::new("C:\\Windows\\System32\\mstsc.exe").is_file();
    }
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|directory| directory.join(executable).is_file())
}

#[tauri::command]
fn wsl_users(distribution: String) -> Result<Vec<String>, String> {
    let distribution = distribution.trim();
    if distribution.is_empty()
        || distribution
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid WSL distribution".into());
    }
    if !cfg!(windows) {
        return Err("WSL user discovery is only available on Windows".into());
    }
    let output = Command::new("wsl.exe")
        .args(["--distribution", distribution, "--", "cat", "/etc/passwd"])
        .output()
        .map_err(|e| format!("cannot query WSL users: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut users = text
        .lines()
        .filter_map(|line| {
            let fields = line.split(':').collect::<Vec<_>>();
            let name = fields.first()?.trim();
            let uid = fields.get(2)?.parse::<u32>().ok()?;
            if name.is_empty() || (uid != 0 && uid < 1000) {
                return None;
            }
            Some(name.to_string())
        })
        .collect::<Vec<_>>();
    users.sort();
    users.dedup();
    Ok(users)
}

#[tauri::command]
fn serial_devices() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        let output = Command::new("reg.exe")
            .args(["query", "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM"])
            .output()
            .map_err(|e| format!("cannot query serial devices: {e}"))?;
        if !output.status.success() {
            return Ok(Vec::new());
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut devices = text
            .lines()
            .filter_map(|line| line.split_whitespace().last())
            .filter(|value| value.to_ascii_uppercase().starts_with("COM"))
            .map(str::to_string)
            .collect::<Vec<_>>();
        devices.sort_by_key(|value| value.to_ascii_lowercase());
        devices.dedup();
        return Ok(devices);
    }
    #[cfg(not(windows))]
    {
        let mut devices = fs::read_dir("/dev")
            .map_err(|e| format!("cannot query serial devices: {e}"))?
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| {
                name.starts_with("ttyUSB") || name.starts_with("ttyACM") || name.starts_with("ttyS")
            })
            .map(|name| format!("/dev/{name}"))
            .collect::<Vec<_>>();
        devices.sort();
        Ok(devices)
    }
}

#[tauri::command]
fn sftp_preview(
    host: String,
    username: String,
    port: u16,
    remote_path: String,
) -> Result<String, String> {
    if host.trim().is_empty() || username.trim().is_empty() || port == 0 {
        return Err("SFTP requires host, username, and a valid port".into());
    }
    if remote_path.trim().is_empty() || remote_path.chars().any(|c| c.is_control() || c == '"') {
        return Err("invalid remote preview path".into());
    }
    let temporary =
        std::env::temp_dir().join(format!("moraxterm-preview-{}", chrono_like_timestamp()));
    let mut command = std::process::Command::new(if cfg!(windows) { "sftp.exe" } else { "sftp" });
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-P",
        &port.to_string(),
        "-b",
        "-",
        &format!("{}@{}", username, host),
    ]);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("cannot start sftp: {e}"))?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(
                format!("get \"{}\" \"{}\"\nbye\n", remote_path, temporary.display()).as_bytes(),
            )
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = fs::remove_file(&temporary);
        return Err(if message.is_empty() {
            "remote preview failed".into()
        } else {
            message
        });
    }
    let data = fs::read(&temporary).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&temporary);
    if data.len() > 1_048_576 {
        return Err("remote preview is limited to 1 MiB".into());
    }
    String::from_utf8(data).map_err(|_| "remote preview supports UTF-8 text files only".into())
}

#[tauri::command]
fn ssh_known_hosts_status(host: String, port: u16) -> Result<String, String> {
    if host.trim().is_empty() || port == 0 {
        return Err("host and port are required".into());
    }
    let path = dirs::home_dir()
        .ok_or("home directory unavailable")?
        .join(".ssh")
        .join("known_hosts");
    if !path.exists() {
        return Ok(format!(
            "known_hosts={} entry_present=false",
            path.display()
        ));
    }
    let output = std::process::Command::new(if cfg!(windows) {
        "ssh-keygen.exe"
    } else {
        "ssh-keygen"
    })
    .args(["-F", host.trim(), "-f", path.to_string_lossy().as_ref()])
    .output()
    .map_err(|e| format!("cannot run ssh-keygen: {e}"))?;
    Ok(format!(
        "known_hosts={} entry_present={}",
        path.display(),
        output.status.success()
    ))
}

#[tauri::command]
fn ssh_known_hosts_remove(host: String, port: u16) -> Result<String, String> {
    if host.trim().is_empty() || port == 0 {
        return Err("host and port are required".into());
    }
    let path = dirs::home_dir()
        .ok_or("home directory unavailable")?
        .join(".ssh")
        .join("known_hosts");
    if !path.exists() {
        return Ok("known_hosts entry absent".into());
    }
    let key = if port == 22 {
        host.trim().to_string()
    } else {
        format!("[{}]:{}", host.trim(), port)
    };
    let output = std::process::Command::new(if cfg!(windows) {
        "ssh-keygen.exe"
    } else {
        "ssh-keygen"
    })
    .args(["-R", &key, "-f", path.to_string_lossy().as_ref()])
    .output()
    .map_err(|e| format!("cannot run ssh-keygen: {e}"))?;
    if output.status.success() {
        Ok("known_hosts entry removed".into())
    } else {
        Err("known_hosts entry removal failed".into())
    }
}

fn scan_host_key(host: &str, port: u16) -> Result<std::process::Output, String> {
    if host.trim().is_empty()
        || host.chars().any(|c| c.is_control() || c.is_whitespace())
        || port == 0
    {
        return Err("invalid host or port".into());
    }
    std::process::Command::new(if cfg!(windows) {
        "ssh-keyscan.exe"
    } else {
        "ssh-keyscan"
    })
    .args(["-T", "8", "-p", &port.to_string(), host])
    .output()
    .map_err(|e| format!("cannot run ssh-keyscan: {e}"))
}

#[tauri::command]
fn ssh_known_hosts_scan(host: String, port: u16) -> Result<String, String> {
    let output = scan_host_key(host.trim(), port)?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err("host-key scan returned no key".into());
    }
    let mut fingerprint = std::process::Command::new(if cfg!(windows) {
        "ssh-keygen.exe"
    } else {
        "ssh-keygen"
    })
    .args(["-lf", "-"])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| format!("cannot run ssh-keygen: {e}"))?;
    if let Some(mut input) = fingerprint.stdin.take() {
        input.write_all(&output.stdout).map_err(|e| e.to_string())?;
    }
    let result = fingerprint.wait_with_output().map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err("cannot calculate host-key fingerprint".into());
    }
    Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
}

#[tauri::command]
fn ssh_known_hosts_add(
    host: String,
    port: u16,
    expected_fingerprint: String,
) -> Result<String, String> {
    let output = scan_host_key(host.trim(), port)?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err("host-key scan returned no key".into());
    }
    let mut fingerprint = std::process::Command::new(if cfg!(windows) {
        "ssh-keygen.exe"
    } else {
        "ssh-keygen"
    })
    .args(["-lf", "-"])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| format!("cannot run ssh-keygen: {e}"))?;
    if let Some(mut input) = fingerprint.stdin.take() {
        input.write_all(&output.stdout).map_err(|e| e.to_string())?;
    }
    let result = fingerprint.wait_with_output().map_err(|e| e.to_string())?;
    let actual = String::from_utf8_lossy(&result.stdout);
    if !actual
        .lines()
        .any(|line| line.contains(expected_fingerprint.trim()))
    {
        return Err("host-key fingerprint changed or confirmation did not match".into());
    }
    let path = dirs::home_dir()
        .ok_or("home directory unavailable")?
        .join(".ssh")
        .join("known_hosts");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&output.stdout).map_err(|e| e.to_string())?;
    Ok("host key added after fingerprint confirmation".into())
}

#[tauri::command]
fn sftp_list(host: String, username: String, port: u16, path: String) -> Result<String, String> {
    if host.trim().is_empty() || username.trim().is_empty() || port == 0 {
        return Err("SFTP requires host, username, and a valid port".into());
    }
    if path.trim().is_empty()
        || path
            .chars()
            .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err("invalid SFTP path".into());
    }
    let mut command = std::process::Command::new(if cfg!(windows) { "sftp.exe" } else { "sftp" });
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-P",
        &port.to_string(),
        "-b",
        "-",
        &format!("{}@{}", username, host),
    ]);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("cannot start sftp: {e}"))?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(format!("ls -la {}\nbye\n", path).as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).into_owned();
    }
    Ok(text)
}

#[tauri::command]
fn sftp_transfer(
    host: String,
    username: String,
    port: u16,
    direction: String,
    local_path: String,
    remote_path: String,
) -> Result<String, String> {
    if host.trim().is_empty() || username.trim().is_empty() || port == 0 {
        return Err("SFTP requires host, username, and a valid port".into());
    }
    let direction = direction.to_ascii_lowercase();
    if !["upload", "download"].contains(&direction.as_str()) {
        return Err("SFTP transfer must be upload or download".into());
    }
    for value in [&local_path, &remote_path] {
        if value.trim().is_empty() || value.chars().any(|c| c.is_control() || c == '"') {
            return Err("invalid SFTP transfer path".into());
        }
    }
    let command_line = if direction == "upload" {
        format!("put \"{}\" \"{}\"\nbye\n", local_path, remote_path)
    } else {
        format!("get \"{}\" \"{}\"\nbye\n", remote_path, local_path)
    };
    let mut command = std::process::Command::new(if cfg!(windows) { "sftp.exe" } else { "sftp" });
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-P",
        &port.to_string(),
        "-b",
        "-",
        &format!("{}@{}", username, host),
    ]);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("cannot start sftp: {e}"))?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(command_line.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).into_owned();
    }
    Ok(text)
}

#[tauri::command]
fn start_sftp_transfer(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    host: String,
    username: String,
    port: u16,
    direction: String,
    local_path: String,
    remote_path: String,
    resume: bool,
) -> Result<String, String> {
    if host.trim().is_empty() || username.trim().is_empty() || port == 0 {
        return Err("SFTP requires host, username, and a valid port".into());
    }
    let direction = direction.to_ascii_lowercase();
    if !["upload", "download"].contains(&direction.as_str()) {
        return Err("SFTP transfer must be upload or download".into());
    }
    for value in [&local_path, &remote_path] {
        if value.trim().is_empty() || value.chars().any(|c| c.is_control() || c == '"') {
            return Err("invalid SFTP transfer path".into());
        }
    }
    let transfer_command = if direction == "upload" {
        if resume {
            "reput"
        } else {
            "put"
        }
    } else if resume {
        "reget"
    } else {
        "get"
    };
    let command_line = if direction == "upload" {
        format!(
            "{} \"{}\" \"{}\"\nbye\n",
            transfer_command, local_path, remote_path
        )
    } else {
        format!(
            "{} \"{}\" \"{}\"\nbye\n",
            transfer_command, remote_path, local_path
        )
    };
    let id = format!("sftp-{}", chrono_like_timestamp());
    let mut command = std::process::Command::new(if cfg!(windows) { "sftp.exe" } else { "sftp" });
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-P",
        &port.to_string(),
        "-b",
        "-",
        &format!("{}@{}", username, host),
    ]);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(sftp_error) if !resume => {
            let mut fallback =
                std::process::Command::new(if cfg!(windows) { "scp.exe" } else { "scp" });
            let remote = format!("{}@{}:{}", username, host, remote_path);
            fallback.args([
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=8",
                "-P",
                &port.to_string(),
            ]);
            if direction == "upload" {
                fallback.args([local_path.as_str(), remote.as_str()]);
            } else {
                fallback.args([remote.as_str(), local_path.as_str()]);
            }
            fallback.spawn().map_err(|scp_error| {
                format!("cannot start sftp or scp: {sftp_error}; {scp_error}")
            })?
        }
        Err(error) => return Err(format!("cannot start sftp for resumable transfer: {error}")),
    };
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(command_line.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    state
        .sftp_jobs
        .lock()
        .map_err(|_| "SFTP manager poisoned")?
        .insert(id.clone(), child);
    let jobs = Arc::clone(&state.sftp_jobs);
    let job_id = id.clone();
    let progress_app = app.clone();
    let progress_path = local_path.clone();
    let progress_direction = direction.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));
        if progress_direction == "download" {
            if let Ok(metadata) = std::fs::metadata(&progress_path) {
                let _ = progress_app.emit(
                    "sftp-transfer-progress",
                    SftpTransferEvent {
                        id: job_id.clone(),
                        success: false,
                        message: "progress".into(),
                        transferred_bytes: Some(metadata.len()),
                        total_bytes: None,
                    },
                );
            }
        }
        let finished = {
            let mut active = match jobs.lock() {
                Ok(value) => value,
                Err(_) => break,
            };
            let Some(child) = active.get_mut(&job_id) else {
                break;
            };
            child.try_wait().ok().flatten().is_some()
        };
        if !finished {
            continue;
        }
        let Some(child) = jobs
            .lock()
            .ok()
            .and_then(|mut active| active.remove(&job_id))
        else {
            break;
        };
        let result = child.wait_with_output();
        let (success, message) = match result {
            Ok(output) => {
                let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
                if text.is_empty() {
                    text = String::from_utf8_lossy(&output.stderr).into_owned();
                }
                (output.status.success(), text)
            }
            Err(error) => (false, error.to_string()),
        };
        let _ = app.emit(
            "sftp-transfer-exit",
            SftpTransferEvent {
                id: job_id.clone(),
                success,
                message,
                transferred_bytes: None,
                total_bytes: None,
            },
        );
        break;
    });
    Ok(id)
}

#[tauri::command]
fn cancel_sftp_transfer(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    id: String,
) -> Result<bool, String> {
    let mut jobs = state
        .sftp_jobs
        .lock()
        .map_err(|_| "SFTP manager poisoned")?;
    let Some(mut child) = jobs.remove(&id) else {
        return Ok(false);
    };
    child.kill().map_err(|e| e.to_string())?;
    let _ = app.emit(
        "sftp-transfer-exit",
        SftpTransferEvent {
            id,
            success: false,
            message: "transfer cancelled".into(),
            transferred_bytes: None,
            total_bytes: None,
        },
    );
    Ok(true)
}

#[tauri::command]
fn sftp_operation(
    host: String,
    username: String,
    port: u16,
    operation: String,
    path: String,
    target: String,
    mode: String,
) -> Result<String, String> {
    if host.trim().is_empty() || username.trim().is_empty() || port == 0 {
        return Err("SFTP requires host, username, and a valid port".into());
    }
    let operation = operation.to_ascii_lowercase();
    if !["mkdir", "rename", "delete", "chmod"].contains(&operation.as_str()) {
        return Err("unsupported SFTP operation".into());
    }
    for value in [&path, &target, &mode] {
        if value.trim().is_empty() || value.chars().any(|c| c.is_control() || c == '"') {
            return Err("invalid SFTP operation path or mode".into());
        }
    }
    let command_line = match operation.as_str() {
        "mkdir" => format!("mkdir \"{}\"\n", path),
        "rename" => format!("rename \"{}\" \"{}\"\n", path, target),
        "delete" => format!("rm \"{}\"\nrmdir \"{}\"\n", path, path),
        "chmod" => format!("chmod {} \"{}\"\n", mode, path),
        _ => unreachable!(),
    };
    let mut command = std::process::Command::new(if cfg!(windows) { "sftp.exe" } else { "sftp" });
    command.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-P",
        &port.to_string(),
        "-b",
        "-",
        &format!("{}@{}", username, host),
    ]);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("cannot start sftp: {e}"))?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(format!("{}bye\n", command_line).as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).into_owned();
    }
    if !output.status.success() {
        return Err(text.trim().to_string());
    }
    Ok(text)
}

#[tauri::command]
fn run_network_tool(tool: String, target: String, port: Option<u16>) -> Result<String, String> {
    if target.trim().is_empty() {
        return Err("network target cannot be empty".into());
    }
    let tool = tool.to_ascii_lowercase();
    if tool == "port" {
        let port = port.ok_or("port is required for a TCP check")?;
        if port == 0 {
            return Err("port must be non-zero".into());
        }
        let address = format!("{}:{}", target, port);
        let resolved = address.to_socket_addrs().map_err(|e| e.to_string())?;
        for socket in resolved {
            if TcpStream::connect_timeout(&socket, Duration::from_secs(3)).is_ok() {
                return Ok(format!("TCP {} is open", address));
            }
        }
        return Ok(format!("TCP {} is closed or unreachable", address));
    }
    let (program, args): (&str, Vec<String>) = match tool.as_str() {
        "ping" if cfg!(windows) => ("ping", vec!["-n".into(), "4".into(), target]),
        "ping" => ("ping", vec!["-c".into(), "4".into(), target]),
        "traceroute" if cfg!(windows) => ("tracert", vec![target]),
        "traceroute" => ("traceroute", vec!["-m".into(), "12".into(), target]),
        "dns" if cfg!(windows) => ("nslookup", vec![target]),
        "dns" => ("getent", vec!["hosts".into(), target]),
        _ => return Err("tool must be ping, traceroute, dns, or port".into()),
    };
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("cannot run network tool: {e}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.is_empty() {
        text = String::from_utf8_lossy(&output.stderr).into_owned();
    }
    Ok(text)
}

#[tauri::command]
fn start_recording(
    state: State<'_, TerminalManager>,
    id: String,
    path: String,
) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("recording path cannot be empty".into());
    }
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("cannot open recording file: {e}"))?;
    state
        .recordings
        .lock()
        .map_err(|_| "recording manager poisoned")?
        .insert(id, file);
    Ok(())
}

#[tauri::command]
fn stop_recording(state: State<'_, TerminalManager>, id: String) -> Result<bool, String> {
    Ok(state
        .recordings
        .lock()
        .map_err(|_| "recording manager poisoned")?
        .remove(&id)
        .is_some())
}

#[tauri::command]
fn start_terminal(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    id: String,
    session: Option<moraxterm_core::Session>,
    program: Option<String>,
) -> Result<(), String> {
    debug_write(
        &state.debug,
        "terminal",
        &format!(
            "start requested id={} session_type={} program={}",
            id,
            session
                .as_ref()
                .map(|s| s.session_type.as_str())
                .unwrap_or("local"),
            program.as_deref().unwrap_or("default")
        ),
    );
    let mut environment = session
        .as_ref()
        .map(|value| value.environment.clone())
        .unwrap_or_default();
    let mut askpass_path = None;
    if let Some(ssh) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("SSH"))
    {
        let account = format!("{}@{}:{}", ssh.username.trim(), ssh.host.trim(), ssh.port);
        if let Ok(entry) = keyring::Entry::new("com.moraxterm.ssh", &account) {
            if let Ok(secret) = entry.get_password() {
                let helper = create_ssh_askpass(&secret)?;
                environment.insert("MORAXTERM_SSH_SECRET".into(), secret);
                environment.insert("SSH_ASKPASS".into(), helper.to_string_lossy().into_owned());
                environment.insert("SSH_ASKPASS_REQUIRE".into(), "force".into());
                environment.insert("DISPLAY".into(), "moraxterm:0".into());
                askpass_path = Some(helper);
            }
        }
    }
    let startup_command = session
        .as_ref()
        .map(|value| value.startup_command.clone())
        .unwrap_or_default();
    let working_directory = session
        .as_ref()
        .map(|value| value.working_directory.clone())
        .unwrap_or_default();
    let (program_name, args): (String, Vec<String>) = if let Some(program) = program {
        (program, Vec::new())
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("SSH"))
    {
        if session.host.trim().is_empty() || session.username.trim().is_empty() || session.port == 0
        {
            return Err("SSH session requires host, username, and a valid port".into());
        }
        let mut ssh_args = session.ssh_plan().map_err(|error| error.to_string())?.argv;
        if ssh_args.first().is_some_and(|value| value == "ssh") {
            ssh_args.remove(0);
        }
        ssh_args.insert(0, "-X".into());
        ("ssh".into(), ssh_args)
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("Rdp"))
    {
        if session.host.trim().is_empty() || session.port == 0 {
            return Err("RDP session requires host and a valid port".into());
        }
        let args = vec![format!("/v:{}:{}", session.host, session.port)];
        (
            if cfg!(windows) {
                "mstsc.exe".into()
            } else {
                "xfreerdp".into()
            },
            args,
        )
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("Vnc"))
    {
        if session.host.trim().is_empty() || session.port == 0 {
            return Err("VNC session requires host and a valid port".into());
        }
        (
            if cfg!(windows) {
                "vncviewer.exe".into()
            } else {
                "vncviewer".into()
            },
            vec![format!("{}:{}", session.host, session.port)],
        )
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("WSL"))
    {
        if session.host.trim().is_empty() {
            return Err("WSL session requires a distribution name".into());
        }
        let mut args = vec!["-d".into(), session.host.clone()];
        if !session.wsl_user.trim().is_empty() {
            args.extend(["-u".into(), session.wsl_user.clone()]);
        }
        if !session.wsl_command.trim().is_empty() {
            args.extend(["--".into(), session.wsl_command.clone()]);
        }
        (
            if cfg!(windows) {
                "wsl.exe".into()
            } else {
                "wsl".into()
            },
            args,
        )
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("Telnet"))
    {
        if session.host.trim().is_empty() || session.port == 0 {
            return Err("Telnet session requires host and a valid port".into());
        }
        (
            if cfg!(windows) {
                "telnet.exe".into()
            } else {
                "telnet".into()
            },
            vec![session.host.clone(), session.port.to_string()],
        )
    } else if let Some(session) = session
        .as_ref()
        .filter(|value| value.session_type.eq_ignore_ascii_case("Serial"))
    {
        if session.host.trim().is_empty() {
            return Err("Serial session requires a device path".into());
        }
        if cfg!(windows) {
            return Err("Serial Tauri sessions currently require a Linux socat environment".into());
        }
        let baud = if session.serial_baud == 0 {
            115200
        } else {
            session.serial_baud
        };
        let data_bits = if session.serial_data_bits == 0 {
            8
        } else {
            session.serial_data_bits
        };
        let parity = match session.serial_parity.to_ascii_lowercase().as_str() {
            "even" => "even=1",
            "odd" => "odd=1",
            _ => "parenb=0",
        };
        let flow = if session.serial_flow_control.eq_ignore_ascii_case("hardware") {
            ",crtscts=1"
        } else {
            ""
        };
        (
            "socat".into(),
            vec![
                "-".into(),
                "raw,echo=0".into(),
                format!(
                    "{},b{},cs{},{}{}",
                    session.host, baud, data_bits, parity, flow
                ),
            ],
        )
    } else if let Some(session) = session.as_ref().filter(|value| {
        value.session_type.eq_ignore_ascii_case("Shell") && !value.shell.trim().is_empty()
    }) {
        match session.shell.trim().to_ascii_lowercase().as_str() {
            "default" | "system" => {
                if cfg!(windows) {
                    (
                        std::env::var("ComSpec")
                            .unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".into()),
                        vec!["/Q".into(), "/K".into()],
                    )
                } else {
                    ("/bin/sh".into(), vec!["-l".into()])
                }
            }
            "cmd" | "cmd.exe" => ("cmd.exe".into(), vec!["/Q".into(), "/K".into()]),
            "powershell" | "powershell.exe" => (
                if cfg!(windows) {
                    "powershell.exe"
                } else {
                    "powershell"
                }
                .into(),
                vec!["-NoLogo".into()],
            ),
            "bash" | "bash.exe" => (
                if cfg!(windows) { "bash.exe" } else { "bash" }.into(),
                vec!["-l".into()],
            ),
            "fish" | "fish.exe" => (
                if cfg!(windows) { "fish.exe" } else { "fish" }.into(),
                vec!["-l".into()],
            ),
            "zsh" | "zsh.exe" => (
                if cfg!(windows) { "zsh.exe" } else { "zsh" }.into(),
                vec!["-l".into()],
            ),
            "nu" | "nu.exe" | "nushell" => (
                if cfg!(windows) { "nu.exe" } else { "nu" }.into(),
                Vec::new(),
            ),
            _ => (session.shell.clone(), Vec::new()),
        }
    } else if cfg!(windows) {
        (
            std::env::var("ComSpec").unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".into()),
            vec!["/Q".into(), "/K".into()],
        )
    } else {
        ("/bin/sh".into(), vec!["-l".into()])
    };
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    debug_write(
        &state.debug,
        "terminal",
        &format!(
            "spawning program={} arg_count={} cwd_set={}",
            program_name,
            args.len(),
            !working_directory.trim().is_empty()
        ),
    );
    let mut process = TerminalProcess::spawn_with_env_and_cwd(
        &program_name,
        &arg_refs,
        &environment,
        Some(&working_directory),
    )
    .map_err(|e| {
        debug_write(&state.debug, "terminal", &format!("spawn failed error={e}"));
        e.to_string()
    })?;
    debug_write(&state.debug, "terminal", "spawn succeeded");
    let mut reader = process.take_reader().map_err(|e| e.to_string())?;
    let shared = Arc::new(Mutex::new(process));
    state
        .processes
        .lock()
        .map_err(|_| "terminal manager poisoned")?
        .insert(id.clone(), Arc::clone(&shared));
    if !startup_command.trim().is_empty() {
        shared
            .lock()
            .map_err(|_| "terminal poisoned")?
            .write(format!("{}\n", startup_command).as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let recordings = Arc::clone(&state.recordings);
    let processes = Arc::clone(&state.processes);
    let debug = Arc::clone(&state.debug);
    debug_write(
        &debug,
        "terminal",
        &format!("reader thread starting id={id}"),
    );
    std::thread::spawn(move || loop {
        let mut buffer = [0_u8; 8192];
        let result = reader
            .read(&mut buffer)
            .map(|count| buffer[..count].to_vec())
            .map_err(|e| e.to_string());
        match result {
            Ok(data) if !data.is_empty() => {
                debug_write(
                    &debug,
                    "terminal",
                    &format!("reader data id={} bytes={}", id, data.len()),
                );
                if let Ok(mut active) = recordings.lock() {
                    if let Some(file) = active.get_mut(&id) {
                        let _ = file.write_all(&data);
                        let _ = file.flush();
                    }
                }
                let event = TerminalEvent {
                    id: id.clone(),
                    data: String::from_utf8_lossy(&data).into_owned(),
                };
                let _ = app.emit("terminal-output", event);
            }
            Ok(_) => {
                if let Ok(mut active) = recordings.lock() {
                    active.remove(&id);
                }
                if let Ok(mut active) = processes.lock() {
                    active.remove(&id);
                }
                let _ = app.emit(
                    "terminal-exit",
                    TerminalEvent {
                        id: id.clone(),
                        data: String::new(),
                    },
                );
                if let Some(path) = askpass_path.as_ref() {
                    let _ = std::fs::remove_file(path);
                }
                break;
            }
            Err(error) => {
                let _ = app.emit(
                    "terminal-output",
                    TerminalEvent {
                        id: id.clone(),
                        data: format!("\r\n[terminal read error: {error}]\r\n"),
                    },
                );
                if let Ok(mut active) = recordings.lock() {
                    active.remove(&id);
                }
                if let Ok(mut active) = processes.lock() {
                    active.remove(&id);
                }
                let _ = app.emit(
                    "terminal-exit",
                    TerminalEvent {
                        id: id.clone(),
                        data: String::new(),
                    },
                );
                if let Some(path) = askpass_path.as_ref() {
                    let _ = std::fs::remove_file(path);
                }
                break;
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn write_terminal(
    state: State<'_, TerminalManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    let process = state
        .processes
        .lock()
        .map_err(|_| "terminal manager poisoned")?
        .get(&id)
        .cloned()
        .ok_or("terminal not found")?;
    let result = process
        .lock()
        .map_err(|_| "terminal poisoned")?
        .write(data.as_bytes())
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
fn resize_terminal(
    state: State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let process = state
        .processes
        .lock()
        .map_err(|_| "terminal manager poisoned")?
        .get(&id)
        .cloned()
        .ok_or("terminal not found")?;
    let result = process
        .lock()
        .map_err(|_| "terminal poisoned")?
        .resize(cols, rows)
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
fn resume_terminal(state: State<'_, TerminalManager>, id: String) -> Result<(), String> {
    let process = state
        .processes
        .lock()
        .map_err(|_| "terminal manager poisoned")?
        .get(&id)
        .cloned()
        .ok_or("terminal not found")?;
    let result = process
        .lock()
        .map_err(|_| "terminal poisoned")?
        .resume()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
fn close_terminal(state: State<'_, TerminalManager>, id: String) -> Result<(), String> {
    let process = state
        .processes
        .lock()
        .map_err(|_| "terminal manager poisoned")?
        .remove(&id);
    if let Some(process) = process {
        process
            .lock()
            .map_err(|_| "terminal poisoned")?
            .kill()
            .map_err(|e| e.to_string())?;
    }
    state
        .recordings
        .lock()
        .map_err(|_| "recording manager poisoned")?
        .remove(&id);
    Ok(())
}

#[tauri::command]
fn run_terminal_command(command: String) -> Result<String, String> {
    if command.trim().is_empty() {
        return Ok(String::new());
    }
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
        .manage(TunnelManager::default())
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            import_sessions,
            export_sessions,
            import_backup,
            save_session,
            delete_session,
            configure_debug_logging,
            debug_log,
            debug_log_path,
            credential_status,
            ssh_agent_status,
            credential_store,
            credential_delete,
            start_tunnel,
            stop_tunnel,
            xserver_status,
            local_list,
            local_preview,
            local_write_text,
            open_local_path,
            shell_available,
            protocol_client_available,
            wsl_distributions,
            wsl_users,
            serial_devices,
            sftp_preview,
            ssh_known_hosts_status,
            ssh_known_hosts_remove,
            ssh_known_hosts_scan,
            ssh_known_hosts_add,
            sftp_list,
            sftp_transfer,
            start_sftp_transfer,
            cancel_sftp_transfer,
            sftp_operation,
            run_network_tool,
            start_recording,
            stop_recording,
            start_terminal,
            write_terminal,
            resize_terminal,
            resume_terminal,
            close_terminal,
            run_terminal_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

fn main() {
    run();
}
