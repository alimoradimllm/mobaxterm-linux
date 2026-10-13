#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${HOME}/.local/share/moraxterm-linux/venv"
BIN_DIR="${HOME}/.local/bin"

if ! command -v python3 >/dev/null 2>&1; then
  echo 'python3 is required; install it with: sudo apt install python3 python3-venv' >&2
  exit 1
fi

if ! python3 -m venv --help >/dev/null 2>&1; then
  echo 'python3-venv is required; install it with: sudo apt install python3-venv' >&2
  exit 1
fi

mkdir -p "$(dirname "$VENV_DIR")" "$BIN_DIR"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install --upgrade "$PROJECT_DIR"
ln -sfn "$VENV_DIR/bin/moraxterm-linux" "$BIN_DIR/moraxterm-linux"
ln -sfn "$VENV_DIR/bin/moraxterm-linux-gui" "$BIN_DIR/moraxterm-linux-gui"

printf 'Installed moraxterm-linux at %s\n' "$BIN_DIR/moraxterm-linux"
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "Add ${BIN_DIR} to PATH: export PATH=\"${BIN_DIR}:\$PATH\"" >&2 ;;
esac
