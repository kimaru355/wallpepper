#!/usr/bin/env bash
# Build the site image on the VPS (BuildKit) and roll it out. Same flow as wallpepper-backend/scripts/deploy.sh.
# Usage: ./site/scripts/deploy.sh [ssh-host]
set -euo pipefail
HOST="${1:-vps}"
cd "$(dirname "$0")/.."     # site/

TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE="kimaru.local/wallpepper-site:${TAG}"
REMOTE_DIR="/tmp/wallpepper-site-${TAG}"

echo "==> Uploading site"
ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
tar czf - --exclude=scripts . | ssh "$HOST" "tar xzf - -C '$REMOTE_DIR'"

echo "==> Building ${IMAGE} and deploying"
ssh "$HOST" "IMAGE='$IMAGE' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
trap 'rm -rf "$REMOTE_DIR" "$REMOTE_DIR.tar"' EXIT
mkdir -p /srv/wallpepper-downloads && chmod 755 /srv/wallpepper-downloads

buildctl build --progress=plain \
  --frontend dockerfile.v0 \
  --local context="$REMOTE_DIR" --local dockerfile="$REMOTE_DIR" \
  --output type=docker,name="$IMAGE",dest="$REMOTE_DIR.tar"
k3s ctr -n k8s.io images import "$REMOTE_DIR.tar"

sed "s#image: IMAGE#image: $IMAGE#" "$REMOTE_DIR/k8s/site.yaml" | kubectl apply -f -
if ! kubectl -n wallpepper rollout status deploy/wallpepper-site --timeout=120s; then
  kubectl -n wallpepper logs -l app.kubernetes.io/name=wallpepper-site --tail=30 --prefix || true
  exit 1
fi
k3s ctr -n k8s.io images ls -q | grep '^kimaru.local/wallpepper-site:' | sort -r | tail -n +4 \
  | xargs -r -n1 k3s ctr -n k8s.io images rm >/dev/null || true
REMOTE
echo "==> Done: https://wallpepper.pcstack.top/"
