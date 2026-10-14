use moraxterm_core::{Session, SessionStore};

#[test]
fn sqlite_store_round_trips_sanitized_sessions() {
    let path = std::env::temp_dir().join(format!("moraxterm-rust-{}.sqlite", std::process::id()));
    let path_string = path.to_string_lossy().to_string();
    let store = SessionStore::open(&path_string).unwrap();
    let sessions = vec![Session::ssh("test", "example.test", "ali")];
    store.replace_all(&sessions).unwrap();
    assert_eq!(store.list().unwrap(), sessions);
    let _ = std::fs::remove_file(path);
}

#[test]
fn sqlite_store_upserts_and_deletes_sessions() {
    let path = std::env::temp_dir().join(format!("moraxterm-editor-{}.sqlite", std::process::id()));
    let path_string = path.to_string_lossy().to_string();
    let store = SessionStore::open(&path_string).unwrap();
    store
        .upsert(&Session::ssh("edited", "example.test", "ali"))
        .unwrap();
    assert_eq!(store.list().unwrap().len(), 1);
    store
        .upsert(&Session::ssh("edited", "updated.test", "ali"))
        .unwrap();
    assert_eq!(store.list().unwrap()[0].host, "updated.test");
    assert!(store.delete("edited").unwrap());
    assert!(store.list().unwrap().is_empty());
    let _ = std::fs::remove_file(path);
}

#[test]
fn sqlite_store_reads_legacy_payload_with_current_defaults() {
    let path = std::env::temp_dir().join(format!("moraxterm-legacy-{}.sqlite", std::process::id()));
    let path_string = path.to_string_lossy().to_string();
    {
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute(
                "CREATE TABLE sessions (name TEXT PRIMARY KEY, payload TEXT NOT NULL)",
                [],
            )
            .unwrap();
        let payload = r#"{"name":"legacy","session_type":"SSH","host":"example.test","username":"ali","port":22}"#;
        connection
            .execute(
                "INSERT INTO sessions(name, payload) VALUES (?1, ?2)",
                rusqlite::params!["legacy", payload],
            )
            .unwrap();
    }
    let store = SessionStore::open(&path_string).unwrap();
    let session = &store.list().unwrap()[0];
    assert_eq!(session.name, "legacy");
    assert_eq!(session.host_key_policy, "");
    assert_eq!(session.keepalive_seconds, 30);
    assert!(!session.favorite);
    let _ = std::fs::remove_file(path);
}
