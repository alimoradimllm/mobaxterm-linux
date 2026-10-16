use moraxterm_core::TerminalProcess;

#[test]
#[cfg(unix)]
fn pty_rejects_zero_dimensions_and_accepts_resize() {
    let process = TerminalProcess::spawn("/bin/sh", &["-c", "sleep 1"]).unwrap();
    assert!(process.resize(0, 24).is_err());
    assert!(process.resize(100, 40).is_ok());
}

#[test]
#[cfg(unix)]
fn pty_processes_ctrl_c_as_interrupt() {
    let mut process =
        TerminalProcess::spawn("/bin/sh", &["-i", "-c", "while :; do :; done"]).unwrap();
    process.write(&[3]).unwrap();
    let output = process.read_to_end().unwrap();
    assert!(String::from_utf8_lossy(&output).contains("^C"));
}

#[test]
#[cfg(unix)]
fn pty_processes_ctrl_d_as_eof() {
    let mut process =
        TerminalProcess::spawn("/bin/sh", &["-i", "-c", "read value; printf eof-ok"]).unwrap();
    process.write(&[4]).unwrap();
    let output = process.read_to_end().unwrap();
    assert!(String::from_utf8_lossy(&output).contains("eof-ok"));
}

#[test]
#[cfg(windows)]
fn windows_pty_captures_embedded_fish_startup_output() {
    use std::collections::HashMap;
    use std::io::Read;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Duration;

    let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let runtime = PathBuf::from(local_app_data)
        .join("Moraxterm")
        .join("unix-runtime");
    let fish = runtime.join("usr").join("bin").join("fish.exe");
    if !fish.is_file() {
        return;
    }
    let home = runtime.join("home").join("moraxterm");
    let temp = runtime.join("tmp").join("moraxterm");
    std::fs::create_dir_all(&home).unwrap();
    std::fs::create_dir_all(&temp).unwrap();
    let mut environment = HashMap::new();
    environment.insert("HOME".into(), home.to_string_lossy().into_owned());
    environment.insert("TMPDIR".into(), temp.to_string_lossy().into_owned());
    environment.insert("TEMP".into(), temp.to_string_lossy().into_owned());
    environment.insert("TMP".into(), temp.to_string_lossy().into_owned());
    environment.insert(
        "PATH".into(),
        format!(
            "{};{}",
            runtime.join("usr").join("bin").display(),
            runtime.join("bin").display()
        ),
    );
    let mut process = TerminalProcess::spawn_with_env_and_cwd(
        &fish.to_string_lossy(),
        &["-l", "-C", "echo embedded-fish-ok"],
        &environment,
        None,
    )
    .unwrap();
    let mut reader = process.take_reader().unwrap();
    let process = std::sync::Arc::new(std::sync::Mutex::new(process));
    let (sender, receiver) = mpsc::channel();
    let response_process = std::sync::Arc::clone(&process);
    std::thread::spawn(move || {
        let mut text = Vec::new();
        let mut buffer = [0_u8; 8192];
        loop {
            let count = match reader.read(&mut buffer) {
                Ok(count) => count,
                Err(error) => {
                    let _ = sender.send(Err(error));
                    return;
                }
            };
            if count == 0 {
                let _ = sender.send(Ok(text));
                return;
            }
            let data = &buffer[..count];
            if data.windows(4).any(|window| window == b"\x1b[6n") {
                response_process
                    .lock()
                    .unwrap()
                    .write(b"\x1b[1;1R")
                    .unwrap();
            }
            text.extend_from_slice(data);
            if text
                .windows("embedded-fish-ok".len())
                .any(|window| window == b"embedded-fish-ok")
            {
                let _ = sender.send(Ok(text));
                return;
            }
        }
    });
    let output = receiver
        .recv_timeout(Duration::from_secs(5))
        .unwrap()
        .unwrap();
    let text = String::from_utf8_lossy(&output);
    eprintln!("embedded fish PTY output: {text:?}");
    assert!(text.contains("embedded-fish-ok"));
}
