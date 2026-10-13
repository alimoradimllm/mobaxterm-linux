#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/pyproject.toml" | head -1)"
ARCH="$(dpkg --print-architecture)"
OUT="$ROOT/dist"
PKG="$(mktemp -d /tmp/moraxterm-deb.XXXXXX)/moraxterm_${VERSION}_${ARCH}"
rm -rf "$PKG"
mkdir -p "$PKG/DEBIAN" "$PKG/usr/lib/moraxterm" "$PKG/usr/bin"
python3 -m pip install --no-deps --target "$PKG/usr/lib/moraxterm" "$ROOT"
cat > "$PKG/DEBIAN/control" <<EOF
Package: moraxterm
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Depends: python3, python3-tk, openssh-client
Maintainer: Hermes Workspace <noreply@example.invalid>
Description: Moraxterm clean-room Linux compatibility layer for sanitized sessions
EOF
cat > "$PKG/usr/bin/moraxterm" <<'EOF'
#!/bin/sh
export PYTHONPATH=/usr/lib/moraxterm${PYTHONPATH:+:$PYTHONPATH}
exec python3 -m moraxterm_cli "$@"
EOF
cat > "$PKG/usr/bin/moraxterm-gui" <<'EOF'
#!/bin/sh
export PYTHONPATH=/usr/lib/moraxterm${PYTHONPATH:+:$PYTHONPATH}
exec python3 -c 'from moraxterm_gui import main; main()' "$@"
EOF
chmod 755 "$PKG/DEBIAN" "$PKG/usr/bin" "$PKG/usr/bin/moraxterm" "$PKG/usr/bin/moraxterm-gui"
dpkg-deb --build "$PKG" "$OUT/moraxterm_${VERSION}_${ARCH}.deb" >/dev/null
printf '%s\n' "$OUT/moraxterm_${VERSION}_${ARCH}.deb"
