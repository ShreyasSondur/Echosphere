#!/usr/bin/env bash
set -e

# ==============================================================================
# EchoSphere 2026 - Contabo VPS Automated Backend Deployment Script
# Target Host: 13.140.172.117:8002 | Domain: echosphere.suiet.website
# Designed to run alongside existing VPS projects safely without collision.
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${BLUE}${BOLD}======================================================${NC}"
echo -e "${BLUE}${BOLD}   🚀 EchoSphere 2026 - Automated Backend Deployment  ${NC}"
echo -e "${BLUE}${BOLD}======================================================${NC}"

# 1. Resolve Script & Working Directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "main.py" ]; then
    BACKEND_DIR="$SCRIPT_DIR"
elif [ -d "backend" ] && [ -f "backend/main.py" ]; then
    BACKEND_DIR="$SCRIPT_DIR/backend"
    cd "$BACKEND_DIR"
else
    echo -e "${RED}[ERROR] main.py not found in current directory or backend/${NC}"
    exit 1
fi

echo -e "${GREEN}[1/6] Working directory:${NC} $BACKEND_DIR"

# 2. Setup .env file from env.b64 (Ideal for UltraVNC where copy-paste is disabled)
if [ ! -f ".env" ]; then
    if [ -f "env.b64" ]; then
        echo -e "${GREEN}[2/6] Restoring .env from env.b64 automatically...${NC}"
        base64 -d env.b64 > .env
        chmod 600 .env
    elif [ -f "../env.b64" ]; then
        echo -e "${GREEN}[2/6] Restoring .env from ../env.b64 automatically...${NC}"
        base64 -d ../env.b64 > .env
        chmod 600 .env
    elif [ -f "env.txt" ]; then
        echo -e "${GREEN}[2/6] Converting env.txt -> .env automatically...${NC}"
        cp env.txt .env
        chmod 600 .env
    else
        echo -e "${RED}[ERROR] Neither .env nor env.b64 found!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[2/6] Active .env file confirmed.${NC}"
fi

# 3. Ensure Python3 and venv utilities are available
echo -e "${GREEN}[3/6] Verifying Python 3 environment...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}Installing python3 and python3-venv...${NC}"
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv curl psmisc
    elif command -v yum &> /dev/null; then
        sudo yum install -y python3 python3-pip curl psmisc
    fi
fi

# 4. Create and activate Python Virtual Environment
if [ ! -d ".venv" ]; then
    echo -e "${GREEN}[4/6] Creating isolated virtual environment (.venv)...${NC}"
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip --quiet 2>/dev/null || true
echo -e "${GREEN}[4/6] Installing backend dependencies...${NC}"
pip install -r requirements.txt --default-timeout=100

# 5. Clean port 8002 & configure Background Daemon Service
echo -e "${GREEN}[5/6] Ensuring port 8002 is clean and starting service...${NC}"

# Kill any orphaned processes on port 8002 cleanly
fuser -k 8002/tcp 2>/dev/null || true
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1

CURRENT_USER=$(whoami)
SERVICE_FILE="/etc/systemd/system/echosphere-backend.service"

if [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
    echo -e "${GREEN}Configuring systemd service at $SERVICE_FILE...${NC}"
    sudo bash -c "cat << EOF > $SERVICE_FILE
[Unit]
Description=EchoSphere 2026 Ticketing Backend API
After=network.target

[Service]
User=$CURRENT_USER
WorkingDirectory=$BACKEND_DIR
ExecStart=$BACKEND_DIR/.venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8002 --workers 2
Restart=always
RestartSec=3
StandardOutput=append:$BACKEND_DIR/backend.log
StandardError=append:$BACKEND_DIR/backend.log
EnvironmentFile=$BACKEND_DIR/.env

[Install]
WantedBy=multi-user.target
EOF"

    sudo systemctl daemon-reload
    sudo systemctl enable echosphere-backend.service
    sudo systemctl restart echosphere-backend.service
    echo -e "${GREEN}Systemd service restarted successfully.${NC}"
else
    # Non-root fallback with nohup & PID file
    echo -e "${YELLOW}Non-sudo environment detected. Running via nohup background daemon...${NC}"
    if [ -f "backend.pid" ]; then
        OLD_PID=$(cat backend.pid)
        if kill -0 "$OLD_PID" 2>/dev/null; then
            kill "$OLD_PID" || true
            sleep 1
        fi
    fi
    nohup "$BACKEND_DIR/.venv/bin/python3" -m uvicorn main:app --host 0.0.0.0 --port 8002 --workers 2 >> backend.log 2>&1 &
    echo $! > backend.pid
    echo -e "${GREEN}Started backend with PID $(cat backend.pid).${NC}"
fi

# Firewall: Open Port 8002 if UFW is active
if command -v ufw &> /dev/null; then
    if sudo ufw status | grep -q "Status: active"; then
        echo -e "${GREEN}Permitting port 8002 in UFW firewall...${NC}"
        sudo ufw allow 8002/tcp || true
    fi
fi

# 6. Self-Verification Health Check Loop (Up to 15s)
echo -e "${GREEN}[6/6] Verifying backend health...${NC}"
READY=0
for i in {1..15}; do
    HEALTH_CHECK=$(curl -s http://127.0.0.1:8002/api/health 2>/dev/null || echo "")
    if [[ "$HEALTH_CHECK" =~ "healthy" ]]; then
        READY=1
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ "$READY" -eq 1 ]; then
    echo -e "\n${GREEN}${BOLD}======================================================${NC}"
    echo -e "${GREEN}${BOLD}   💥 BOOM DONE! EchoSphere Backend is 100% LIVE!     ${NC}"
    echo -e "${GREEN}${BOLD}======================================================${NC}"
    echo -e "   • Local Health:  ${BOLD}http://127.0.0.1:8002/api/health${NC}"
    echo -e "   • Contabo VPS:   ${BOLD}http://13.140.172.117:8002${NC}"
    echo -e "   • Frontend:      ${BOLD}https://echosphere.suiet.website${NC}"
    echo -e "   • Cashfree Mode: ${BOLD}Production (Approved)${NC}"
    echo -e "   • SMTP Port:     ${BOLD}587 (No collision with other VPS projects)${NC}"
    echo -e "\n${BOLD}Backend is running cleanly in background via systemd!${NC}"
else
    echo -e "${RED}[WARNING] Service started, but health check is taking longer to respond.${NC}"
    echo -e "Recent logs from backend.log:"
    tail -n 25 "$BACKEND_DIR/backend.log" 2>/dev/null || true
fi
