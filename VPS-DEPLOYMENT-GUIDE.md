# BotanBot Data Server - VPS Deployment & Update Guide

This guide covers the complete process for deploying and updating the BotanBot Data Server on your VPS.

## 📋 Table of Contents

- [Initial VPS Setup](#initial-vps-setup)
- [Deployment Process](#deployment-process)
- [Update Process (After Code Changes)](#update-process-after-code-changes)
- [Service Management](#service-management)
- [Troubleshooting](#troubleshooting)
- [Monitoring & Logs](#monitoring--logs)

---

## 📦 Data Migration & Setup

### Option 1: Upload Existing Data (⚡ Fastest - Recommended)

If you already have FTP data downloaded locally, upload it to avoid time-consuming FTP sync:

```bash
# From your local development machine
# Upload client data (JSON files)
scp -r ./data/* root@your-vps-ip:/opt/botan-server/data/

# Upload products file
scp ./products.json root@your-vps-ip:/opt/botan-server/

# Upload raw XML data (if you want to keep original files)
scp -r ./Adressen root@your-vps-ip:/opt/botan-server/
scp -r ./Artikel root@your-vps-ip:/opt/botan-server/
scp -r ./History root@your-vps-ip:/opt/botan-server/
```

### Option 2: Create Data Backup for Transfer

Create a compressed backup for easier transfer:

```bash
# On local machine - create backup
tar -czf botan-data-backup.tar.gz data/ products.json Adressen/ Artikel/ History/

# Upload backup to VPS
scp botan-data-backup.tar.gz root@your-vps-ip:/opt/botan-server/

# On VPS - extract backup
cd /opt/botan-server
tar -xzf botan-data-backup.tar.gz
rm botan-data-backup.tar.gz  # Clean up
```

### Option 3: Initial FTP Sync (⏳ Slow - 8,370+ files)

Only use this if you don't have existing data:

```bash
# On VPS - full sync from FTP (takes significant time)
cd /opt/botan-server
npm run sync-and-convert
```

### Data Structure Verification

After migration, verify the data structure:

```bash
# Check data directory structure
ls -la /opt/botan-server/data/

# Check if products.json exists
ls -la /opt/botan-server/products.json

# Verify API data is available
curl http://localhost:5000/api/v1/products | head -20
```

---

## 🚀 Initial VPS Setup

### Prerequisites

- Ubuntu VPS with root access
- Node.js and npm (will be installed automatically)
- Internet connection for GitHub access

### One-Time Setup Commands

```bash
# Download and run the deployment script
curl -O https://raw.githubusercontent.com/toushik018/botan-server/main/deploy-vps.sh
chmod +x deploy-vps.sh
./deploy-vps.sh
```

This script automatically:

- Installs Git, Node.js, TypeScript, and PM2
- Clones the repository from GitHub
- Installs dependencies and builds the application
- Creates production `.env` configuration
- Sets up systemd service and log rotation
- Configures firewall rules

---

## 🔄 Update Process (After Code Changes)

### Step 1: Push Your Changes to GitHub

```bash
# On your local development machine
git add .
git commit -m "Your commit message"
git push origin main
```

### Step 2: Update on VPS

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Navigate to the application directory
cd /opt/botan-server

# Pull latest changes from GitHub
git pull origin main

# Install any new dependencies (if package.json changed)
npm install

# Rebuild the TypeScript application
npm run build

# Restart the service
pm2 restart botan-server

# Verify the service is running
pm2 list
pm2 logs botan-server --lines 20
```

### Step 2.1: Data Sync (Optional)

If you've updated data locally and want to sync it:

```bash
# Option A: Upload updated data files
# From local machine:
scp -r ./data/* root@your-vps-ip:/opt/botan-server/data/
scp ./products.json root@your-vps-ip:/opt/botan-server/

# Option B: Run FTP sync on VPS (slower)
# On VPS:
npm run sync-and-convert
```

### Step 3: Verify Deployment

```bash
# Check if the API is responding
curl http://localhost:5000/api/v1/health

# Check service status
systemctl status botan-server

# View recent logs
pm2 logs botan-server --lines 50
```

---

## ⚙️ Service Management

### PM2 Commands

```bash
# View all running processes
pm2 list

# Start the service
pm2 start ecosystem.config.js --env production

# Stop the service
pm2 stop botan-server

# Restart the service
pm2 restart botan-server

# Delete the service (removes from PM2)
pm2 delete botan-server

# View logs (real-time)
pm2 logs botan-server

# View specific number of log lines
pm2 logs botan-server --lines 100

# Save PM2 process list (for auto-startup)
pm2 save
```

### Systemd Commands

```bash
# Start the systemd service
systemctl start botan-server

# Stop the systemd service
systemctl stop botan-server

# Restart the systemd service
systemctl restart botan-server

# Check service status
systemctl status botan-server

# Enable auto-start on boot
systemctl enable botan-server

# Disable auto-start on boot
systemctl disable botan-server

# View systemd logs
journalctl -u botan-server -f
```

---

## 🛠️ Manual Commands (Alternative Update Method)

### Quick Update Script

Create this file as `/root/update-botan.sh`:

```bash
#!/bin/bash
echo "🔄 Updating BotanBot Data Server..."

cd /opt/botan-server

echo "📥 Pulling latest code from GitHub..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building TypeScript..."
npm run build

echo "🔄 Restarting service..."
pm2 restart botan-server

echo "✅ Update completed!"
echo "📊 Service status:"
pm2 list

echo "🩺 Health check:"
sleep 3
curl -s http://localhost:5000/api/v1/health | jq . || echo "Health check failed"
```

Make it executable:

```bash
chmod +x /root/update-botan.sh
```

Use it:

```bash
./update-botan.sh
```

---

## 🔍 Troubleshooting

### Common Issues & Solutions

#### 1. Service Won't Start

```bash
# Check PM2 logs for errors
pm2 logs botan-server --err

# Check if port 5000 is available
netstat -tulpn | grep :5000

# Manually test the built application
cd /opt/botan-server
NODE_ENV=production node dist/server.js
```

#### 2. Build Failures

```bash
# Clean and rebuild
rm -rf dist/
npm run clean
npm run build

# Check TypeScript compilation errors
npx tsc --noEmit
```

#### 3. Git Pull Issues

```bash
# Reset local changes (if you don't need them)
git reset --hard HEAD
git clean -fd
git pull origin main

# Or stash local changes
git stash
git pull origin main
git stash pop  # Only if you want to restore local changes
```

#### 4. Python Environment Issues

```bash
# Ensure Python3 is available
python3 --version

# Test Python script manually
cd /opt/botan-server
python3 convert.py
```

#### 5. FTP Connection Issues

```bash
# Test FTP connection
npm run test-ftp

# Check FTP logs
pm2 logs botan-server | grep -i ftp
```

---

## 📊 Monitoring & Logs

### Log Locations

- **PM2 Logs**: `/opt/botan-server/logs/botan-pm2*.log`
- **Application Logs**: `/opt/botan-server/logs/app.log`
- **Systemd Logs**: `journalctl -u botan-server`

### Health Monitoring

```bash
# API Health Check
curl http://localhost:5000/api/v1/health

# System Status
curl http://localhost:5000/api/v1/status

# Test Complete Pipeline
npm run sync-and-convert

# Check Data Freshness
npm run status
```

### Performance Monitoring

```bash
# PM2 Monitoring
pm2 monit

# System Resources
htop
df -h
free -m

# Network Connections
netstat -tulpn | grep :5000
```

---

## 🔥 Emergency Recovery

### Complete Service Reset

```bash
# Stop everything
pm2 delete all
systemctl stop botan-server

# Re-clone repository (if corrupted)
cd /opt
rm -rf botan-server
git clone https://github.com/toushik018/botan-server.git
cd botan-server

# Rebuild and restart
npm install
npm run build
pm2 start ecosystem.config.js --env production
systemctl start botan-server
```

### Rollback to Previous Version

```bash
cd /opt/botan-server

# View commit history
git log --oneline -10

# Rollback to specific commit
git reset --hard <commit-hash>

# Rebuild and restart
npm run build
pm2 restart botan-server
```

---

## ⚡ Quick Reference Commands

### Daily Operations

```bash
# Update server
cd /opt/botan-server && git pull && npm run build && pm2 restart botan-server

# Check status
pm2 list && curl -s http://localhost:5000/api/v1/health

# View logs
pm2 logs botan-server --lines 50

# Run manual sync
npm run sync-and-convert
```

### Service URLs

- **Health Check**: `http://your-vps-ip:5000/api/v1/health`
- **API Documentation**: `http://your-vps-ip:5000/api/v1`
- **Products API**: `http://your-vps-ip:5000/api/v1/products`
- **System Status**: `http://your-vps-ip:5000/api/v1/status`

---

## 📝 Configuration Files

### Important Files to Monitor

- `/opt/botan-server/.env` - Environment configuration
- `/opt/botan-server/ecosystem.config.js` - PM2 configuration
- `/etc/systemd/system/botan-server.service` - Systemd service
- `/opt/botan-server/logs/` - Log directory

### Port Configuration

- **botan-server**: Port 5000
- **trivia-server**: Port 8000
- Both services can run simultaneously without conflicts

---

## 🎯 Automated Deployment Webhook (Optional)

For automatic deployments on push to GitHub, you can set up a webhook:

1. Create webhook endpoint on your VPS
2. Configure GitHub webhook to call your endpoint
3. Webhook triggers the update script automatically

This is beyond the scope of this guide but can be implemented for fully automated deployments.

---

## 📞 Support & Maintenance

- Monitor logs daily for any errors
- Run health checks regularly
- Keep the system updated with security patches
- Backup configuration files before major changes
- Test updates in development before deploying to production

Remember: Always test your changes locally before pushing to GitHub and deploying to the VPS!
