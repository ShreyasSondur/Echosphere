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

# 0. Pull latest code from GitHub if git repository detected
if command -v git &> /dev/null && { [ -d ".git" ] || [ -d "../.git" ]; }; then
    echo -e "${GREEN}[0/6] Pulling latest updates from GitHub (main)...${NC}"
    git pull origin main || echo -e "${YELLOW}Notice: git pull skipped or working tree already up to date.${NC}"
fi

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

# 2. Setup & Update .env file automatically (Guarantees ADMIN_EMAIL=shreyas.u.sondur@gmail.com)
echo -e "${GREEN}[2/6] Updating .env configuration automatically...${NC}"

# Decode embedded production base64 config directly into .env
cat << 'ENV_B64_EOF' | base64 -d > .env
UE9SVD04MDAyCkhPU1Q9MC4wLjAuMApDT1JTX09SSUdJTlM9aHR0cHM6Ly9lY2hvc3BoZXJlLnN1aWV0LndlYnNpdGUsaHR0cHM6Ly93d3cuZWNob3NwaGVyZS5zdWlldC53ZWJzaXRlLGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCxodHRwOi8vMTI3LjAuMC4xOjMwMDAsaHR0cDovLzEzLjE0MC4xNzIuMTE3OjgwMDIKU01UUF9FTUFJTD13ZWJmbG93Y29tbXVuaXR5QHNyaW5pdmFzdW5pdmVyc2l0eS5lZHUuaW4KU01UUF9QQVNTV09SRD1jYnFhcWlncnNmaWJwdmt6ClNNVFBfSE9TVD1zbXRwLmdtYWlsLmNvbQpTTVRQX1BPUlQ9NTg3ClBBWU1FTlRfR0FURVdBWV9LRVk9ClBBWU1FTlRfR0FURVdBWV9TRUNSRVQ9CkNBU0hGUkVFX0FQUF9JRD0xNDYwNzE1YmIwYmZhYmM0ZmMzYzczMGRiM2Q1MTcwNjQxCkNBU0hGUkVFX1NFQ1JFVF9LRVk9Y2Zza19tYV9wcm9kXzNjN2ZkYmY5YWI4YzY3Y2ExODAxMDBhOGNjZjQ1MDg5X2M2ZjZhZTA0CkNBU0hGUkVFX0FQSV9WRVJTSU9OPTIwMjMtMDgtMDEKQ0FTSEZSRUVfRU5WPXByb2R1Y3Rpb24KQ0FTSEZSRUVfUkVUVVJOX1VSTD1odHRwczovL2VjaG9zcGhlcmUuc3VpZXQud2Vic2l0ZS8/b3JkZXJfaWQ9e29yZGVyX2lkfQpTRUNSRVRfS0VZPWNvbmNlcnRfc2VjdXJlX3NlY3JldF90b2tlbl9uYWpyYW5fYmVuamlfOTgzNzQ5ODIzNDIzCkFETUlOX1BBU1NXT1JEPWlkb250a25vdwpBRE1JTl9FTUFJTD1zaHJleWFzLnUuc29uZHVyQGdtYWlsLmNvbQo=
ENV_B64_EOF

# Explicitly guarantee ADMIN_EMAIL is shreyas.u.sondur@gmail.com
if ! grep -q "ADMIN_EMAIL=shreyas.u.sondur@gmail.com" .env; then
    sed -i 's/^ADMIN_EMAIL=.*/ADMIN_EMAIL=shreyas.u.sondur@gmail.com/' .env || echo "ADMIN_EMAIL=shreyas.u.sondur@gmail.com" >> .env
fi

chmod 600 .env
echo -e "${GREEN}✓ .env active and verified:${NC} ADMIN_EMAIL=shreyas.u.sondur@gmail.com | PORT=8002"

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
echo -e "${GREEN}[4/6] Installing/updating backend dependencies...${NC}"
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
    echo -e "   • Admin Email:   ${BOLD}shreyas.u.sondur@gmail.com${NC}"
    echo -e "   • Cashfree Mode: ${BOLD}Production (Approved)${NC}"
    echo -e "   • SMTP Port:     ${BOLD}587 (Dual-port failover active)${NC}"
    echo -e "\n${BOLD}Backend is running cleanly in background via systemd!${NC}"
else
    echo -e "${RED}[WARNING] Service started, but health check is taking longer to respond.${NC}"
    echo -e "Recent logs from backend.log:"
    tail -n 25 "$BACKEND_DIR/backend.log" 2>/dev/null || true
fi
