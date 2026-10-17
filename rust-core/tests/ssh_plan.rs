use moraxterm_core::Session;

#[test]
fn ssh_agent_forwarding_is_opt_in() {
    let session = Session::ssh("test", "example.test", "alice");
    let plan = session.ssh_plan().unwrap();
    assert!(!plan
        .argv
        .windows(2)
        .any(|pair| pair == ["-o", "ForwardAgent=yes"]));
}

#[test]
fn enabled_ssh_agent_forwarding_adds_forward_agent_option() {
    let mut session = Session::ssh("test", "example.test", "alice");
    session.ssh_agent_forwarding = true;
    let plan = session.ssh_plan().unwrap();
    assert!(plan
        .argv
        .windows(2)
        .any(|pair| pair == ["-o", "ForwardAgent=yes"]));
}

#[test]
fn default_remote_shell_does_not_append_a_command() {
    let session = Session::ssh("test", "example.test", "alice");
    let plan = session.ssh_plan().unwrap();
    assert_eq!(plan.argv.last().unwrap(), "alice@example.test");
}

#[test]
fn fish_remote_shell_is_structured_as_argv() {
    let mut session = Session::ssh("test", "example.test", "alice");
    session.remote_shell = "fish".into();
    let plan = session.ssh_plan().unwrap();
    assert_eq!(
        &plan.argv[plan.argv.len() - 3..],
        ["alice@example.test", "fish", "-l"]
    );
}

#[test]
fn fish_fallback_uses_remote_posix_probe() {
    let mut session = Session::ssh("test", "example.test", "alice");
    session.remote_shell = "fish-or-sh".into();
    let plan = session.ssh_plan().unwrap();
    assert_eq!(
        &plan.argv[plan.argv.len() - 3..],
        [
            "sh",
            "-lc",
            "if command -v fish >/dev/null 2>&1; then exec fish -l; else exec sh -l; fi"
        ]
    );
}

#[test]
fn proxy_jump_and_host_key_policy_are_structured_in_ssh_plan() {
    let mut session = Session::ssh("test", "target.example", "alice");
    session.proxy_jump = "jump.example".into();
    session.host_key_policy = "strict".into();
    let plan = session.ssh_plan().unwrap();
    assert!(plan
        .argv
        .windows(2)
        .any(|pair| pair == ["-J", "jump.example"]));
    assert!(plan
        .argv
        .windows(2)
        .any(|pair| pair == ["-o", "StrictHostKeyChecking=yes"]));
}
