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
    let mut process = TerminalProcess::spawn("/bin/sh", &["-i", "-c", "while :; do :; done"]).unwrap();
    process.write(&[3]).unwrap();
    let output = process.read_to_end().unwrap();
    assert!(String::from_utf8_lossy(&output).contains("^C"));
}

#[test]
#[cfg(unix)]
fn pty_processes_ctrl_d_as_eof() {
    let mut process = TerminalProcess::spawn("/bin/sh", &["-i", "-c", "read value; printf eof-ok"]).unwrap();
    process.write(&[4]).unwrap();
    let output = process.read_to_end().unwrap();
    assert!(String::from_utf8_lossy(&output).contains("eof-ok"));
}

#[test]
#[cfg(unix)]
fn pty_captures_child_output() {
    let mut process = TerminalProcess::spawn("/bin/sh", &["-c", "printf rust-pty"]).unwrap();
    let output = process.read_to_end().unwrap();
    assert_eq!(output, b"rust-pty");
}
