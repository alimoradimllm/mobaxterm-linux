use mobaxterm_core::TerminalProcess;

#[test]
#[cfg(unix)]
fn pty_captures_child_output() {
    let mut process = TerminalProcess::spawn("/bin/sh", &["-c", "printf rust-pty"]).unwrap();
    let output = process.read_to_end().unwrap();
    assert_eq!(output, b"rust-pty");
}
