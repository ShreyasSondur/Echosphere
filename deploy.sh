#!/usr/bin/env bash
set -e

# ==============================================================================
# EchoSphere 2026 - Root Dispatcher for Contabo VPS Automated Deployment
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/backend/deploy.sh" ]; then
    bash "$SCRIPT_DIR/backend/deploy.sh"
elif [ -f "$SCRIPT_DIR/deploy.sh" ]; then
    bash "$SCRIPT_DIR/deploy.sh"
else
    echo "Could not find deploy.sh in backend directory."
    exit 1
fi
