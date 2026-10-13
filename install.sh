#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${HOME}/.local/share/moraxterm/venv"
BIN_DIR="${HOME}/.local/bin"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"

if ! command -v python3 >/dev/null 2>&1; then
  echo 'python3 is required; install it with: sudo apt install python3 python3-venv' >&2
  exit 1
fi

if ! python3 -m venv --help >/dev/null 2>&1; then
  echo 'python3-venv is required; install it with: sudo apt install python3-venv' >&2
  exit 1
fi

mkdir -p "$(dirname "$VENV_DIR")" "$BIN_DIR" "$APP_DIR" "$ICON_DIR"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install --upgrade "$PROJECT_DIR"
ln -sfn "$VENV_DIR/bin/moraxterm" "$BIN_DIR/moraxterm"
ln -sfn "$VENV_DIR/bin/moraxterm-gui" "$BIN_DIR/moraxterm-gui"
cp "$PROJECT_DIR/packaging/moraxterm.desktop" "$APP_DIR/moraxterm.desktop"
cp "$PROJECT_DIR/assets/moraxterm.png" "$ICON_DIR/moraxterm.png"

printf 'Installed Moraxterm at %s\n' "$BIN_DIR/moraxterm"
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "Add ${BIN_DIR} to PATH: export PATH=\"${BIN_DIR}:\$PATH\"" >&2 ;;
esac
