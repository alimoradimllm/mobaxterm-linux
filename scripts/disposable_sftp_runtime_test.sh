#!/usr/bin/env bash
# Disposable SFTP/SCP runtime test for Moraxterm.
# Starts a throwaway loopback-only sshd with a temporary ed25519 key, then
# exercises the same OpenSSH batch clients Moraxterm uses: list, mkdir, rename,
# chmod, upload, download, resume (reput/reget), delete, and the scp fallback.
# No real credentials or hosts are involved; everything is removed on exit.
set -euo pipefail
umask 077
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/moraxterm-sftp-test.XXXXXX")"
PORT="${MORAXTERM_TEST_SFTP_PORT:-22224}"
USER_NAME="$(id -un)"
KEY="$ROOT/user_key"
KNOWN="$ROOT/known_hosts"
SFTP_SERVER="$(ls /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/openssh/sftp-server 2>/dev/null | head -1 || true)"
SSHD_PID=""
cleanup() {
  [ -n "$SSHD_PID" ] && kill "$SSHD_PID" 2>/dev/null || true
  rm -rf "$ROOT"
}
trap cleanup EXIT
fail() { echo "ERROR $*"; exit 1; }
[ -n "$SFTP_SERVER" ] || fail "sftp-server binary not found"

mkdir -p "$ROOT/srv" "$ROOT/remote" "$ROOT/local"
ssh-keygen -q -t ed25519 -N '' -f "$KEY"
ssh-keygen -q -t ed25519 -N '' -f "$ROOT/srv/host_key"
cp "$KEY.pub" "$ROOT/srv/authorized_keys"
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
ssh-keyscan -T 5 -p "$PORT" 127.0.0.1 2>/dev/null > "$KNOWN"
test -s "$KNOWN" || fail "host key scan failed"

OPTS=(-i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN" -o BatchMode=yes -o ConnectTimeout=5)
TARGET="$USER_NAME@127.0.0.1"
sftp_batch() { printf '%s\n' "$@" | sftp -q "${OPTS[@]}" -P "$PORT" -b - "$TARGET"; }
R="$ROOT/remote"; L="$ROOT/local"

# 1. list
echo hello > "$R/seed.txt"
sftp_batch "ls $R" | grep -q seed.txt || fail "list"
echo 'sftp_list=passed'

# 2. mkdir / rename / chmod
sftp_batch "mkdir $R/dir" "rename $R/dir $R/dir2" "chmod 700 $R/dir2"
[ "$(stat -c %a "$R/dir2")" = 700 ] || fail "mkdir/rename/chmod"
echo 'sftp_mkdir_rename_chmod=passed'

# 3. upload + byte-exact verify
head -c 2097152 /dev/urandom > "$L/up.bin"
sftp_batch "put $L/up.bin $R/up.bin"
cmp "$L/up.bin" "$R/up.bin" || fail "upload content"
echo 'sftp_upload=passed'

# 4. download + byte-exact verify
sftp_batch "get $R/up.bin $L/down.bin"
cmp "$R/up.bin" "$L/down.bin" || fail "download content"
echo 'sftp_download=passed'

# 5. resume upload (reput) from a truncated remote copy
head -c 700000 "$L/up.bin" > "$R/partial.bin"
sftp_batch "reput $L/up.bin $R/partial.bin"
cmp "$L/up.bin" "$R/partial.bin" || fail "reput resume"
echo 'sftp_resume_upload=passed'

# 6. resume download (reget) from a truncated local copy
head -c 500000 "$R/up.bin" > "$L/partial_down.bin"
sftp_batch "reget $R/up.bin $L/partial_down.bin"
cmp "$R/up.bin" "$L/partial_down.bin" || fail "reget resume"
echo 'sftp_resume_download=passed'

# 7. delete
sftp_batch "rm $R/seed.txt" "rmdir $R/dir2"
[ ! -e "$R/seed.txt" ] && [ ! -e "$R/dir2" ] || fail "delete"
echo 'sftp_delete=passed'

# 8. scp fallback (non-resumable), both directions
scp -q "${OPTS[@]}" -P "$PORT" "$L/up.bin" "$TARGET:$R/scp_up.bin"
cmp "$L/up.bin" "$R/scp_up.bin" || fail "scp upload"
scp -q "${OPTS[@]}" -P "$PORT" "$TARGET:$R/scp_up.bin" "$L/scp_down.bin"
cmp "$L/up.bin" "$L/scp_down.bin" || fail "scp download"
echo 'scp_fallback=passed'

# 9. unknown host key is rejected under strict checking
if sftp -q -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$ROOT/empty_known" -o BatchMode=yes -o ConnectTimeout=5 -P "$PORT" -b /dev/null "$TARGET" >/dev/null 2>&1; then
  fail "sftp trusted unknown host"
fi
echo 'sftp_strict_unknown_host=rejected'
echo 'DISPOSABLE_SFTP_RUNTIME_TEST=PASS'
