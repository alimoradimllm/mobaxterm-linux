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
fn windows_pty_captures_cmd_startup_output() {
    use std::io::Read;
    use std::sync::mpsc;
    use std::time::Duration;

    let mut process = TerminalProcess::spawn("cmd.exe", &["/Q", "/K"]).unwrap();
    let mut reader = process.take_reader().unwrap();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        let result = reader
            .read(&mut buffer)
            .map(|count| buffer[..count].to_vec());
        let _ = sender.send(result);
    });
    let output = receiver
        .recv_timeout(Duration::from_secs(5))
        .unwrap()
        .unwrap();
    assert!(!output.is_empty(), "cmd.exe produced no startup output");
}
