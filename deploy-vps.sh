#!/bin/bash

# Hetzner VPS Deployment Script for BotanBot Data Server
# MULTIPLE SERVICES VERSION - Runs alongside existing triva-server
# Run this script on your VPS to deploy the application

set -e  # Exit on any error

echo "🚀 Starting BotanBot Data Server deployment on Hetzner VPS (Multi-Service Setup)..."
echo "📋 This will run alongside your existing triva-server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (recommended for VPS setup)
if [ "$EUID" -ne 0 ]; then
    print_warning "Running as non-root user. Some commands may require sudo."
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_status "Installing Git..."
    apt update
    apt install -y git
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# Check if PM2 is already installed (likely from triva-server)
if command -v pm2 &> /dev/null; then
    print_success "PM2 is already installed (from triva-server setup)"
else
    print_status "Installing PM2 process manager..."
    npm install -g pm2
fi

# Check existing PM2 processes
print_status "Checking existing PM2 processes..."
pm2 list

# Create application directory
APP_DIR="/opt/botan-server"
print_status "Creating application directory: $APP_DIR"
mkdir -p $APP_DIR

# Navigate to app directory
cd $APP_DIR

# Clone the application from GitHub
print_status "Cloning application from GitHub..."
if [ -d ".git" ]; then
    print_status "Repository already exists, pulling latest changes..."
    git pull origin main
else
    print_status "Cloning fresh repository..."
    git clone https://github.com/toushik018/botan-server.git .
fi

print_success "Application source code ready from GitHub"

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install

# Install TypeScript globally if not present
if ! command -v tsc &> /dev/null; then
    print_status "Installing TypeScript globally..."
    npm install -g typescript
fi

# Build the application
print_status "Building TypeScript application..."
npx tsc

# Create required directories
print_status "Creating required directories..."
mkdir -p logs data
# Set up production environment file
if [ ! -f ".env" ]; then
    cat > .env << EOL
# Environment Configuration
NODE_ENV=production
PORT=5000  # Different port from triva-server (port 8000)

# FTP Configuration (Production server)
FTP_HOST=k79k51.meinserver.io
FTP_PORT=21
FTP_USER=c365265_susko
FTP_PASS='w]Jifw$=7x.?7H
FTP_SECURE=true

# Data Paths
DATA_SOURCE_PATH=/web/src/api-files/susko.ai
DATA_OUTPUT_PATH=./data
PRODUCTS_OUTPUT_PATH=./products.json

# Sync Schedule (Daily at 2 AM)
SYNC_SCHEDULE=0 2 * * *

# API Configuration
API_PREFIX=/api/v1
MAX_FILE_SIZE=50mb
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
EOL
    print_success "Created production .env file (Port 5000, triva-server uses 8000)"
else
    print_status ".env file already exists"
    print_warning "Make sure PORT is set to 5000 (triva-server uses 8000)"
fi

# Set up systemd service for auto-start
print_status "Setting up systemd service..."

# Find PM2 path
PM2_PATH=$(which pm2)
print_status "Found PM2 at: $PM2_PATH"

tee /etc/systemd/system/botan-server.service > /dev/null << EOL
[Unit]
Description=BotanBot Data Server
After=network.target

[Service]
Type=forking
User=root
WorkingDirectory=$APP_DIR
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
ExecStart=$PM2_PATH start ecosystem.config.js --env production
ExecReload=$PM2_PATH reload ecosystem.config.js --env production
ExecStop=$PM2_PATH delete ecosystem.config.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# Enable and start the service
systemctl daemon-reload
systemctl enable botan-server
print_success "Systemd service configured"

# Set up log rotation
print_status "Setting up log rotation..."
tee /etc/logrotate.d/botan-server > /dev/null << EOL
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}
EOL
print_success "Log rotation configured"

# Set up firewall
print_status "Configuring UFW firewall..."
ufw allow ssh
ufw allow 5000/tcp
print_warning "Firewall rules added. Enable with: ufw enable"

# Final setup
print_status "Setting up PM2 startup script..."
pm2 startup
print_warning "Run the command shown above to complete PM2 startup configuration"

print_success "🎉 Deployment setup completed!"
echo ""
print_status "Next steps:"
echo "1. Application deployed from GitHub repository"
echo "2. Run 'systemctl start botan-server' to start the service"
echo "3. Check status with 'systemctl status botan-server'"
echo "4. View logs with 'pm2 logs' or 'journalctl -u botan-server'"
echo "5. Enable firewall with 'ufw enable'"
echo ""
print_status "Your server will automatically:"
echo "• Start on system boot"
echo "• Sync FTP data daily at 2 AM"
echo "• Serve API on port 5000"
echo "• Auto-restart on crashes"
echo "• Rotate logs automatically"