use moraxterm_core::{import_ini, SessionStore};
use std::env;
use std::fs;
use std::path::PathBuf;

fn usage() {
    eprintln!("usage: moraxterm-core import <Moraxterm.ini> | store-import <Moraxterm.ini> <sessions.sqlite3> | list <sessions.sqlite3>");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("import") => {
            let path = args.next().ok_or("missing INI path")?;
            let sessions = import_ini(&fs::read_to_string(path)?)?;
            println!("{}", serde_json::to_string_pretty(&sessions)?);
        }
        Some("store-import") => {
            let ini = PathBuf::from(args.next().ok_or("missing INI path")?);
            let db = args.next().ok_or("missing SQLite path")?;
            let sessions = import_ini(&fs::read_to_string(ini)?)?;
            let store = SessionStore::open(&db)?;
            store.replace_all(&sessions)?;
            println!("stored {} sessions", sessions.len());
        }
        Some("list") => {
            let db = args.next().ok_or("missing SQLite path")?;
            let store = SessionStore::open(&db)?;
            println!("{}", serde_json::to_string_pretty(&store.list()?)?);
        }
        _ => {
            usage();
            std::process::exit(2);
        }
    }
    Ok(())
}
