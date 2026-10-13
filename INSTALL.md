# Install on Ubuntu

From a checkout of this directory:

```bash
sudo apt update
sudo apt install -y python3 python3-pip openssh-client

# Optional backends
sudo apt install -y freerdp3-x11 || sudo apt install -y freerdp2-x11
sudo apt install -y tigervnc-viewer mosh telnet socat

./install.sh
```

If Ubuntu blocks system-wide pip installs, the script installs into the user
site. Ensure `~/.local/bin` is on `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```bash
moraxterm-linux --help
python3 -m unittest -q
```

Import a sanitized Moraxterm configuration:

```bash
moraxterm-linux import /path/to/Moraxterm.ini > imported-sessions.json
```

Connect in dry-run mode first:

```bash
moraxterm-linux connect \
  --sessions imported-sessions.json \
  --name "SESSION NAME"
```

Launch only after reviewing the generated command:

```bash
moraxterm-linux connect \
  --sessions imported-sessions.json \
  --name "SESSION NAME" \
  --execute
```

Passwords and private-key contents are never imported or placed in command
arguments. Use OpenSSH keys and the Ubuntu desktop keyring for credentials.
