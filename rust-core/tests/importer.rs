use moraxterm_core::{import_bookmarks, import_ini};

#[test]
fn imports_ssh_and_excludes_secret_fields() {
    let ini =
        "[Session Demo]\nType=SSH\nHost=example.test\nUser=ali\nPassword=do-not-store\nPort=2222\n";
    let sessions = import_ini(ini).unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].name, "Demo");
    assert_eq!(sessions[0].host, "example.test");
    assert_eq!(sessions[0].username, "ali");
    assert_eq!(sessions[0].port, 2222);
    assert!(!serde_json::to_string(&sessions)
        .unwrap()
        .contains("do-not-store"));
}

#[test]
fn imports_mixed_ini_and_bookmark_records() {
    let text = "[Session demo]\ntype=SSH\nhost=example.test\nuser=ali\n\n[Bookmarks]\nRemote=#0#0%other.test%2222%root%";
    let mut sessions = import_ini(text).unwrap();
    sessions.extend(import_bookmarks(text).unwrap());
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].host, "example.test");
    assert_eq!(sessions[1].host, "other.test");
}

#[test]
fn skips_non_session_sections() {
    let ini = "[Global]\nPassword=secret\n[Session Shell]\nType=Shell\n";
    assert!(import_ini(ini).unwrap().is_empty());
}
