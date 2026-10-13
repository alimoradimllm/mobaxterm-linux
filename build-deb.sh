#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/pyproject.toml" | head -1)"
ARCH="$(dpkg --print-architecture)"
OUT="$ROOT/dist"
PKG="$(mktemp -d /tmp/mobaxterm-linux-deb.XXXXXX)/mobaxterm-linux_${VERSION}_${ARCH}"
rm -rf "$PKG"
mkdir -p "$PKG/DEBIAN" "$PKG/usr/lib/mobaxterm-linux" "$PKG/usr/bin"

python3 -m pip install --no-deps --target "$PKG/usr/lib/mobaxterm-linux" "$ROOT"
cat > "$PKG/DEBIAN/control" <<EOF
Package: mobaxterm-linux
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Depends: python3, python3-tk, openssh-client
Maintainer: Hermes Workspace <noreply@example.invalid>
Description: Clean-room Linux compatibility layer for sanitized MobaXterm sessions
EOF
cat > "$PKG/usr/bin/mobaxterm-linux" <<'EOF'
#!/bin/sh
export PYTHONPATH=/usr/lib/mobaxterm-linux${PYTHONPATH:+:$PYTHONPATH}
exec python3 -m mobaxterm_cli "$@"
EOF
cat > "$PKG/usr/bin/mobaxterm-linux-gui" <<'EOF'
#!/bin/sh
export PYTHONPATH=/usr/lib/mobaxterm-linux${PYTHONPATH:+:$PYTHONPATH}
exec python3 -c 'from mobaxterm_gui import main; main()' "$@"
EOF
chmod 755 "$PKG/DEBIAN" "$PKG/usr/bin" "$PKG/usr/bin/mobaxterm-linux" "$PKG/usr/bin/mobaxterm-linux-gui"
dpkg-deb --build "$PKG" "$OUT/mobaxterm-linux_${VERSION}_${ARCH}.deb" >/dev/null
printf '%s\n' "$OUT/mobaxterm-linux_${VERSION}_${ARCH}.deb"
