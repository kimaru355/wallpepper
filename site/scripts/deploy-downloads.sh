#!/usr/bin/env bash
# Apply the /downloads/ server (the site itself is deployed from GitHub by the VPS dashboard).
# Usage: ./site/scripts/deploy-downloads.sh [ssh-host]
set -euo pipefail
HOST="${1:-vps}"
cd "$(dirname "$0")/.."
ssh "$HOST" "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply -f - && KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n wallpepper rollout status deploy/wallpepper-downloads --timeout=120s" < k8s/downloads.yaml
