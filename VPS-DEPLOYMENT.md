# 🚀 VPS Deployment Guide for BotanBot Data Server

## Overview

Your BotanBot Data Server is designed for **fully automated operation** on a Hetzner VPS. Once deployed, it will:

- **Automatically sync FTP data** every day at 2 AM (server time)
- **Smart file detection**: Only downloads new/modified files
- **Auto-convert** XML to JSON after each sync
- **Serve REST API** on port 5000 for your AI voice agent
- **Auto-restart** on crashes and reboot
- **Monitor health** and log everything

## 🔄 Automated Sync Flow

```
┌─ Every Day at 2:00 AM ─┐
│                        │
├── 1. Check FTP Server  │ ← k79k51.meinserver.io/susko.ai/
│   ├── Adressen/        │   (Client XML files)
│   ├── Artikel/         │   (Product XML files)
│   └── History/         │   (Order history XML)
│                        │
├── 2. Smart Download    │ ← Only new/modified files
│   ├── Size comparison  │   (with encoding fixes)
│   ├── Timestamp check  │   (skip unchanged files)
│   └── German umlauts   │   (Ü, Ö, Ä now work!)
│                        │
├── 3. XML → JSON        │ ← Using your Python script
│   ├── products.json    │   (All products)
│   └── data/*.json      │   (Individual clients)
│                        │
└── 4. API Ready         │ ← http://your-vps:5000/api/v1/
    ├── /products        │
    ├── /products/search │
    └── /health          │
```

## 📋 VPS Deployment Steps

### 1. Prepare Your Files

Create a deployment package with these files:

```
botan-server/
├── src/              ← Your TypeScript source code
├── package.json      ← Dependencies
├── .env              ← Production configuration
├── convert.py        ← Your Python conversion script
├── ecosystem.config.js ← PM2 configuration (created)
└── deploy-vps.sh     ← Deployment script (created)
```

### 2. Upload to VPS

```bash
# Option A: Using SCP
scp -r botan-server/ root@your-vps-ip:/tmp/

# Option B: Using Git
git clone your-repository.git /opt/botan-server
```

### 3. Run Deployment Script

```bash
# On your VPS
cd /tmp/botan-server/
chmod +x deploy-vps.sh
./deploy-vps.sh
```

The script automatically:

- ✅ Installs Node.js 18.x LTS
- ✅ Installs Python 3 + pip
- ✅ Installs PM2 process manager
- ✅ Sets up systemd service
- ✅ Configures log rotation
- ✅ Sets up firewall rules
- ✅ Creates production environment

### 4. Start the Service

```bash
# Start the server
sudo systemctl start botan-server

# Check status
sudo systemctl status botan-server

# View logs
pm2 logs
```

## 🔧 Production Configuration

Your `.env` file is already configured for production:

```bash
# Automatic daily sync at 2 AM
SYNC_SCHEDULE=0 2 * * *

# FTP server (your existing server)
FTP_HOST=k79k51.meinserver.io
FTP_USER=c365265_susko

# API server on port 5000
PORT=5000
NODE_ENV=production
```

## 📊 Monitoring & Management

### Health Check

```bash
curl http://your-vps:5000/health
```

### Manual Sync (if needed)

```bash
# Trigger immediate sync
curl -X POST http://your-vps:5000/admin/sync

# Or via command line
cd /opt/botan-server
npm run sync-and-convert
```

### View Job Status

```bash
curl http://your-vps:5000/admin/jobs
```

### Check Logs

```bash
# Application logs
tail -f /opt/botan-server/logs/app.log

# PM2 logs
pm2 logs botan-server

# System service logs
journalctl -u botan-server -f
```

## 🔄 How Conversion Happens

1. **FTP Sync** downloads files to `/opt/botan-server/data/`
2. **Python Script** (`convert.py`) processes the XML files:
   - `Adressen/*.xml` → Individual client JSON files
   - `Artikel/*.xml` → Combined `products.json`
   - `History/*.xml` → Integrated into client files
3. **API** serves the converted JSON data immediately

## 🔐 Security Features

- ✅ **Helmet.js** security headers
- ✅ **CORS** protection
- ✅ **UFW firewall** (SSH + port 5000 only)
- ✅ **Non-root execution**
- ✅ **Process isolation** with PM2

## 🚨 Troubleshooting

### If sync fails:

```bash
# Check FTP connection
npm run test-ftp

# Check conversion status
npm run status

# Run manual sync
npm run sync-and-convert
```

### If server won't start:

```bash
# Check PM2 status
pm2 status

# Restart service
sudo systemctl restart botan-server

# Check logs
pm2 logs botan-server --lines 50
```

### Character encoding issues:

Your encoding fixes are now included! Files with German umlauts (Ü, Ö, Ä) should download correctly.

## 📈 Performance

With your optimizations:

- **Fast batch processing**: 20 files at once
- **Smart skipping**: Only downloads changed files
- **Efficient encoding**: Handles German characters properly
- **Connection pooling**: Reduces FTP overhead

Expected sync time: **2-5 minutes** for incremental updates (vs. 10+ minutes before).

## 🔄 Update Process

To update your server:

```bash
# Stop service
sudo systemctl stop botan-server

# Update files
cd /opt/botan-server
git pull  # or upload new files

# Rebuild
npm run build

# Restart
sudo systemctl start botan-server
```

## 🎯 API Endpoints for Your AI

Once running, your AI can access:

```
GET  http://your-vps:5000/api/v1/products
GET  http://your-vps:5000/api/v1/products/search/{term}
GET  http://your-vps:5000/api/v1/products/category/{category}
GET  http://your-vps:5000/api/v1/products/{article_number}
GET  http://your-vps:5000/health
```

---

## ✅ Success Checklist

- [ ] VPS deployed and running
- [ ] Systemd service active (`systemctl status botan-server`)
- [ ] Health check responds (`curl http://your-vps:5000/health`)
- [ ] Automatic sync scheduled (check logs at 2 AM)
- [ ] API endpoints accessible
- [ ] Logs rotating properly
- [ ] PM2 monitoring active

Your server is now **fully automated** and will keep your data synchronized without any manual intervention! 🎉
