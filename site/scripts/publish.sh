#!/usr/bin/env bash
# Publish a release to https://wallpepper.pcstack.top/downloads/
#   1. put the files in releases/<version>/  (Wallpepper-<version>.apk, Wallpepper-Setup-<version>.exe, *.AppImage, *.deb)
#   2. ./site/scripts/publish.sh <version> [ssh-host]
# Files are uploaded to /srv/wallpepper-downloads/<version>/ on the node (served read-only by the site pod),
# verified by checksum, and only then is latest.json switched to the new version (atomic rename).
set -euo pipefail
VERSION="${1:?usage: publish.sh <version> [ssh-host]}"
HOST="${2:-vps}"
cd "$(dirname "$0")/../.."
DIR="releases/$VERSION"
[ -d "$DIR" ] || { echo "no such folder: $DIR"; exit 1; }
DEST=/srv/wallpepper-downloads

node site/scripts/make-manifest.mjs "$VERSION"

echo "==> Uploading $DIR"
ssh "$HOST" "mkdir -p $DEST/$VERSION"
for f in "$DIR"/*; do
  name=$(basename "$f")
  [ "$name" = latest.json ] && continue
  echo "   $name"
  ssh "$HOST" "cat > $DEST/$VERSION/$name.part" < "$f"
  ssh "$HOST" "mv $DEST/$VERSION/$name.part $DEST/$VERSION/$name"
done

echo "==> Verifying checksums on the server"
node -e '
const m=require("./'"$DIR"'/latest.json");
console.log(m.files.map(f=>f.sha256+"  "+f.file).join("\n"));' | ssh "$HOST" "cd $DEST/$VERSION && sha256sum -c --quiet - && echo all checksums OK"

echo "==> Activating $VERSION"
ssh "$HOST" "cat > $DEST/latest.json.part" < "$DIR/latest.json"
ssh "$HOST" "chmod -R a+rX $DEST && mv $DEST/latest.json.part $DEST/latest.json && chmod a+r $DEST/latest.json"
echo "==> Done: https://wallpepper.pcstack.top/  (manifest: /downloads/latest.json)"
