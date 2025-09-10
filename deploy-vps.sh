#!/bin/bash

# Hetzner VPS Deployment Script for BotanBot Data Server
# Run this script on your VPS to deploy the application

set -e  # Exit on any error

echo "🚀 Starting BotanBot Data Server deployment on Hetzner VPS..."

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please don't run this script as root"
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x (LTS)
print_status "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python (for conversion script)
print_status "Installing Python and pip..."
sudo apt-get install -y python3 python3-pip

# Install PM2 globally
print_status "Installing PM2 process manager..."
sudo npm install -g pm2

# Install required Python packages
print_status "Installing Python packages..."
pip3 install xml.etree.ElementTree json os datetime sys argparse

# Create application directory
APP_DIR="/opt/botan-server"
print_status "Creating application directory: $APP_DIR"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Navigate to app directory
cd $APP_DIR

# Clone or copy your application files here
print_status "Setting up application files..."
print_warning "Manual step: Copy your application files to $APP_DIR"
print_warning "Make sure to include: src/, package.json, .env, convert.py, ecosystem.config.js"

# Install dependencies
if [ -f "package.json" ]; then
    print_status "Installing Node.js dependencies..."
    npm install --production
else
    print_warning "package.json not found. Please copy your application files first."
fi

# Build the application
if [ -f "package.json" ]; then
    print_status "Building TypeScript application..."
    npm run build
fi

# Create required directories
print_status "Creating required directories..."
mkdir -p logs data

# Set up environment file
if [ ! -f ".env" ]; then
    print_status "Creating production .env file..."
    cat > .env << EOL
# Environment Configuration
NODE_ENV=production
PORT=5000

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
    print_success "Created production .env file"
else
    print_status ".env file already exists"
fi

# Set up systemd service for auto-start
print_status "Setting up systemd service..."
sudo tee /etc/systemd/system/botan-server.service > /dev/null << EOL
[Unit]
Description=BotanBot Data Server
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=$APP_DIR
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/local/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/local/bin/pm2 delete ecosystem.config.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable botan-server
print_success "Systemd service configured"

# Set up log rotation
print_status "Setting up log rotation..."
sudo tee /etc/logrotate.d/botan-server > /dev/null << EOL
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOL
print_success "Log rotation configured"

# Set up firewall
print_status "Configuring UFW firewall..."
sudo ufw allow ssh
sudo ufw allow 5000/tcp
print_warning "Firewall rules added. Enable with: sudo ufw enable"

# Final setup
print_status "Setting up PM2 startup script..."
pm2 startup
print_warning "Run the command shown above to complete PM2 startup configuration"

print_success "🎉 Deployment setup completed!"
echo ""
print_status "Next steps:"
echo "1. Copy your application files to $APP_DIR"
echo "2. Run 'sudo systemctl start botan-server' to start the service"
echo "3. Check status with 'sudo systemctl status botan-server'"
echo "4. View logs with 'pm2 logs' or 'journalctl -u botan-server'"
echo "5. Enable firewall with 'sudo ufw enable'"
echo ""
print_status "Your server will automatically:"
echo "• Start on system boot"
echo "• Sync FTP data daily at 2 AM"
echo "• Serve API on port 5000"
echo "• Auto-restart on crashes"
echo "• Rotate logs automatically"