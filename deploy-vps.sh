#!/bin/bash
set -e

echo "========================================="
echo "   ⚔️ IronFront.ir - VPS Deployment ⚔️   "
echo "========================================="

# 1. Check & Install Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
    systemctl enable --now docker || true
fi

# 2. Check Docker Compose (Plugin or standalone)
COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "📦 Installing docker-compose-plugin..."
    apt-get update && apt-get install -y docker-compose-plugin || true
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        echo "❌ Docker Compose could not be found or installed."
        exit 1
    fi
fi

# 3. Ensure data directory exists
mkdir -p ./data
chmod -R 777 ./data

# 4. Ensure .env exists
if [ ! -f .env ]; then
    echo "⚙️ Creating default .env configuration..."
    cat << 'EOF' > .env
DOMAIN=open.zguard.ir
GAME_ENV=dev
STANDALONE=true
DISABLE_TURNSTILE=true
NUM_WORKERS=2
API_KEY=IRONFRONT_DEV_KEY
ADMIN_BOT_API_KEY=IRONFRONT_ADMIN_KEY
TURNSTILE_SITE_KEY=1x00000000000000000000AA
PORT=3000
EOF
fi

# 5. Open UFW ports if active
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    echo "🛡️ Configuring UFW Firewall for ports 80 and 443..."
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
fi

# 6. Build and start container
echo "🚀 Building and launching IronFront container..."
$COMPOSE_CMD down --remove-orphans || true
$COMPOSE_CMD build
$COMPOSE_CMD up -d

# 7. Check container status
echo "🔍 Checking container status..."
sleep 5
$COMPOSE_CMD ps

SERVER_IP=$(curl -s -4 https://ifconfig.me || curl -s -4 https://api.ipify.org || hostname -I | awk '{print $1}')

echo "========================================="
echo "✅ IronFront is now deployed and running!"
echo ""
echo "🌐 Access your game at:"
echo "   http://${SERVER_IP}"
echo "   http://ironfront.ir (if domain points to this IP)"
echo ""
echo "📋 Useful commands:"
echo "   View live logs : $COMPOSE_CMD logs -f"
echo "   Restart server : $COMPOSE_CMD restart"
echo "   Stop server    : $COMPOSE_CMD down"
echo "========================================="
