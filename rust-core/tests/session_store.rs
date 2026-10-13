use mobaxterm_core::{Session, SessionStore};

#[test]
fn sqlite_store_round_trips_sanitized_sessions() {
    let path = std::env::temp_dir().join(format!("mobaxterm-rust-{}.sqlite", std::process::id()));
    let path_string = path.to_string_lossy().to_string();
    let store = SessionStore::open(&path_string).unwrap();
    let sessions = vec![Session::ssh("test", "example.test", "ali")];
    store.replace_all(&sessions).unwrap();
    assert_eq!(store.list().unwrap(), sessions);
    let _ = std::fs::remove_file(path);
}
