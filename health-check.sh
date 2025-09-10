#!/bin/bash

# BotanBot Server Health Monitor Script
# Run this to check if everything is working properly on your VPS

echo "🔍 BotanBot Server Health Check"
echo "================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if script is run from correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Run this script from the botan-server directory${NC}"
    exit 1
fi

echo -e "${BLUE}📊 System Status:${NC}"

# Check if Node.js process is running
if pgrep -f "node dist/server.js" > /dev/null; then
    echo -e "${GREEN}✅ Server process is running${NC}"
else
    echo -e "${RED}❌ Server process is NOT running${NC}"
fi

# Check PM2 status
echo -e "\n${BLUE}📦 PM2 Status:${NC}"
pm2 status botan-server 2>/dev/null || echo -e "${YELLOW}⚠️  PM2 not managing the process${NC}"

# Check systemd service
echo -e "\n${BLUE}🔧 System Service:${NC}"
if systemctl is-active --quiet botan-server; then
    echo -e "${GREEN}✅ botan-server service is active${NC}"
else
    echo -e "${RED}❌ botan-server service is NOT active${NC}"
fi

# Check port 5000
echo -e "\n${BLUE}🌐 Network:${NC}"
if netstat -tlnp | grep -q ":5000 "; then
    echo -e "${GREEN}✅ Port 5000 is listening${NC}"
else
    echo -e "${RED}❌ Port 5000 is NOT listening${NC}"
fi

# Health check API
echo -e "\n${BLUE}🏥 API Health Check:${NC}"
if curl -s http://localhost:5000/health > /dev/null; then
    echo -e "${GREEN}✅ API health endpoint responding${NC}"
    # Get detailed health info
    echo -e "${BLUE}📋 Server Details:${NC}"
    curl -s http://localhost:5000/health | jq '.' 2>/dev/null || curl -s http://localhost:5000/health
else
    echo -e "${RED}❌ API health endpoint NOT responding${NC}"
fi

# Check scheduled jobs
echo -e "\n${BLUE}⏰ Scheduled Jobs:${NC}"
if curl -s http://localhost:5000/admin/jobs > /dev/null; then
    echo -e "${GREEN}✅ Job scheduler responding${NC}"
    # Get job status
    curl -s http://localhost:5000/admin/jobs | jq '.scheduler' 2>/dev/null || echo "Job status available via /admin/jobs"
else
    echo -e "${YELLOW}⚠️  Job scheduler endpoint not accessible${NC}"
fi

# Check data freshness
echo -e "\n${BLUE}📁 Data Status:${NC}"
if [ -f "products.json" ]; then
    echo -e "${GREEN}✅ products.json exists${NC}"
    file_age=$(stat -c %Y products.json)
    current_time=$(date +%s)
    age_hours=$(((current_time - file_age) / 3600))
    echo -e "${BLUE}📅 Data age: ${age_hours} hours${NC}"
    
    if [ $age_hours -lt 25 ]; then
        echo -e "${GREEN}✅ Data is fresh (< 25 hours)${NC}"
    else
        echo -e "${YELLOW}⚠️  Data is old (> 25 hours)${NC}"
    fi
else
    echo -e "${RED}❌ products.json does NOT exist${NC}"
fi

# Check data directory
if [ -d "data" ] && [ "$(ls -A data)" ]; then
    file_count=$(find data -name "*.json" | wc -l)
    echo -e "${GREEN}✅ Data directory contains ${file_count} JSON files${NC}"
else
    echo -e "${RED}❌ Data directory is empty or missing${NC}"
fi

# Check logs
echo -e "\n${BLUE}📝 Recent Logs:${NC}"
if [ -f "logs/app.log" ]; then
    echo -e "${GREEN}✅ Application logs available${NC}"
    echo -e "${BLUE}🕐 Last 3 log entries:${NC}"
    tail -n 3 logs/app.log | while read line; do
        echo -e "${YELLOW}   $line${NC}"
    done
else
    echo -e "${RED}❌ No application logs found${NC}"
fi

# Check disk space
echo -e "\n${BLUE}💾 Disk Usage:${NC}"
df -h . | tail -1 | awk '{print "Used: " $3 " / " $2 " (" $5 ")"}'

# Check memory usage
echo -e "\n${BLUE}🧠 Memory Usage:${NC}"
if pgrep -f "node dist/server.js" > /dev/null; then
    pid=$(pgrep -f "node dist/server.js")
    memory_kb=$(ps -o rss= -p $pid 2>/dev/null)
    if [ -n "$memory_kb" ]; then
        memory_mb=$((memory_kb / 1024))
        echo -e "${BLUE}Server process: ${memory_mb}MB${NC}"
    fi
fi

# Summary
echo -e "\n${BLUE}📋 Quick Actions:${NC}"
echo "View live logs:     tail -f logs/app.log"
echo "Restart service:    sudo systemctl restart botan-server"
echo "Manual sync:        npm run sync-and-convert"
echo "Test FTP:          npm run test-ftp"
echo "Check jobs:        curl http://localhost:5000/admin/jobs"

echo -e "\n${GREEN}🎉 Health check completed!${NC}"