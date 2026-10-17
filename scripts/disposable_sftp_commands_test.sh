#!/usr/bin/env bash
# Runs the Tauri bridge's real sftp_list / sftp_operation / sftp_transfer
# commands against a throwaway loopback sshd.
#
# Intended for Debian WSL on a Windows host: sshd runs in WSL, and the ignored
# Rust test is run by the Windows toolchain (cargo.exe) so the Windows
# sftp.exe code path is the one under test. Nothing touches the real ~/.ssh;
# the test points sftp at a temporary ssh config via MORAXTERM_TEST_SSH_CONFIG.
set -euo pipefail
umask 077
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/moraxterm-sftp-cmd.XXXXXX")"
PORT="${MORAXTERM_TEST_SFTP_PORT:-22225}"
SFTP_SERVER="$(ls /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/openssh/sftp-server 2>/dev/null | head -1 || true)"
SSHD_PID=""
WIN_DIR=""
cleanup() {
  [ -n "$SSHD_PID" ] && kill "$SSHD_PID" 2>/dev/null || true
  [ -n "$WIN_DIR" ] && rm -rf "$WIN_DIR"
  rm -rf "$ROOT"
}
trap cleanup EXIT
[ -n "$SFTP_SERVER" ] || { echo "ERROR sftp-server not found"; exit 1; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Windows-visible scratch dir for the client key, known_hosts, config and local files.
WIN_TEMP="$(wslpath "$(cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
WIN_DIR="$(mktemp -d "$WIN_TEMP/moraxterm-sftp-cmd.XXXXXX")"
WIN_DIR_NATIVE="$(wslpath -m "$WIN_DIR")"

mkdir -p "$ROOT/srv" "$ROOT/remote"
ssh-keygen -q -t ed25519 -N '' -f "$WIN_DIR/user_key"
ssh-keygen -q -t ed25519 -N '' -f "$ROOT/srv/host_key"
cp "$WIN_DIR/user_key.pub" "$ROOT/srv/authorized_keys"
cat > "$ROOT/srv/sshd_config" <<CFG
Port $PORT
ListenAddress 127.0.0.1
HostKey $ROOT/srv/host_key
AuthorizedKeysFile $ROOT/srv/authorized_keys
PidFile $ROOT/srv/sshd.pid
UsePAM no
PasswordAuthentication no
KbdInteractiveAuthentication no
StrictModes no
LogLevel ERROR
Subsystem sftp $SFTP_SERVER
CFG
/usr/sbin/sshd -f "$ROOT/srv/sshd_config" -E "$ROOT/srv/log"
SSHD_PID="$(cat "$ROOT/srv/sshd.pid")"
ssh-keyscan -T 5 -p "$PORT" 127.0.0.1 2>/dev/null > "$WIN_DIR/known_hosts"
test -s "$WIN_DIR/known_hosts"
cat > "$WIN_DIR/ssh_config" <<CFG
Host *
  IdentityFile $WIN_DIR_NATIVE/user_key
  IdentitiesOnly yes
  UserKnownHostsFile $WIN_DIR_NATIVE/known_hosts
  StrictHostKeyChecking yes
CFG
mkdir -p "$WIN_DIR/local"

export MORAXTERM_TEST_SSH_CONFIG="$WIN_DIR_NATIVE/ssh_config"
export MORAXTERM_TEST_SFTP_PORT="$PORT"
export MORAXTERM_TEST_SFTP_USER="$(id -un)"
export MORAXTERM_TEST_SFTP_REMOTE_DIR="$ROOT/remote"
export MORAXTERM_TEST_SFTP_LOCAL_DIR="$WIN_DIR_NATIVE/local"
export WSLENV="MORAXTERM_TEST_SSH_CONFIG:MORAXTERM_TEST_SFTP_PORT:MORAXTERM_TEST_SFTP_USER:MORAXTERM_TEST_SFTP_REMOTE_DIR:MORAXTERM_TEST_SFTP_LOCAL_DIR"

cd "$REPO/tauri-ui/src-tauri"
cargo.exe test sftp_commands_roundtrip -- --ignored --nocapture
echo 'DISPOSABLE_SFTP_COMMANDS_TEST=PASS'
