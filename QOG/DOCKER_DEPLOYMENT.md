# Docker Deployment Guide 🐳

Complete guide for deploying QOG using Docker and Docker Compose.

## Prerequisites

### Software
- Docker 20.10+
- Docker Compose 1.29+
- gcloud CLI (for GCP)
- Git

### Credentials
- Google Gemini API Key
- GCP Project with billing enabled

### System Requirements
- 2+ CPU cores
- 512MB RAM minimum (1GB recommended)
- 15GB disk space (20GB boot + 10GB data)
- Stable internet connection

---

## Local Development Setup

### Step 1: Set Environment Variables

```bash
export GEMINI_API_KEY="your-actual-api-key"
export VITE_API_URL="http://localhost/api"
export DATA_DIR="/srv/app/data"
```

### Step 2: Create Data Directory

```bash
mkdir -p /srv/app/data
chmod 755 /srv/app/data
```

### Step 3: Build Containers

```bash
docker-compose build --no-cache
```

### Step 4: Start Services

```bash
# Background mode
docker-compose up -d

# Or with logs
docker-compose up
```

### Step 5: Verify

```bash
# Check containers
docker-compose ps

# Test API
curl http://localhost/api/health

# Access frontend
# Open browser: http://localhost
```

---

## GCP Cloud Deployment

### Step 1: Create VM

```bash
export PROJECT_ID="qog-app-$(date +%s)"
export ZONE="us-central1-a"
export VM_NAME="qog-vm"

gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID
gcloud billing projects link $PROJECT_ID --billing-account=<YOUR_BILLING_ID>

gcloud compute instances create $VM_NAME \
  --image-family=ubuntu-2204-lts \
  --machine-type=e2-micro \
  --zone=$ZONE \
  --boot-disk-size=20GB
```

### Step 2: Create Persistent Disk

```bash
gcloud compute disks create qog-data-disk \
  --size=10GB \
  --zone=$ZONE

gcloud compute instances attach-disk $VM_NAME \
  --disk=qog-data-disk \
  --zone=$ZONE
```

### Step 3: Configure Firewall

```bash
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create allow-ssh \
  --allow=tcp:22 --source-ranges=0.0.0.0/0
```

### Step 4: SSH and Install Docker

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE

# Inside VM:
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 5: Mount Persistent Disk

```bash
lsblk  # Find your disk (usually /dev/sdb)

sudo mkfs.ext4 /dev/sdb
sudo mkdir -p /srv/app/data
sudo mount /dev/sdb /srv/app/data
sudo chown $USER:$USER /srv/app/data

# Make persistent
echo '/dev/sdb /srv/app/data ext4 defaults 0 0' | sudo tee -a /etc/fstab
```

### Step 6: Upload Project Files

```bash
# On local machine
tar --exclude='node_modules' --exclude='venv' --exclude='.git' \
  -czf qog-deploy.tar.gz QOG/

gcloud compute scp qog-deploy.tar.gz $VM_NAME:/tmp/ --zone=$ZONE

rm qog-deploy.tar.gz
```

### Step 7: Extract and Setup

```bash
# On VM
cd /tmp
tar -xzf qog-deploy.tar.gz
sudo mkdir -p /srv/app/app
sudo cp -r QOG/* /srv/app/app/
sudo chown -R $USER:$USER /srv/app/app
cd /srv/app/app
```

### Step 8: Set Environment & Build

```bash
cat > .env << EOF
GEMINI_API_KEY=your-api-key
VITE_API_URL=http://<EXTERNAL_IP>/api
PORT=5000
DATA_DIR=/data
EOF

docker compose build --no-cache
docker compose up -d
```

### Step 9: Get External IP & Test

```bash
# Get IP
EXTERNAL_IP=$(gcloud compute instances describe $VM_NAME \
  --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

# Test
curl http://$EXTERNAL_IP/api/health

# Update docker-compose.yml with this IP and restart
```

---

## Docker Commands Reference

### Container Management
```bash
docker-compose up -d                 # Start services
docker-compose down                  # Stop services
docker-compose restart               # Restart all
docker-compose ps                    # Show status
```

### Building
```bash
docker-compose build                 # Build all
docker-compose build --no-cache      # Rebuild without cache
```

### Debugging
```bash
docker-compose logs backend          # Backend logs
docker-compose logs -f frontend      # Follow frontend logs
docker-compose exec backend sh       # Shell into backend
docker stats                         # Resource usage
```

### Cleaning
```bash
docker-compose down                  # Remove containers
docker system prune -a               # Remove unused resources
```

---

## Troubleshooting

### "Failed to fetch" Error
- Ensure `VITE_API_URL` uses external IP, not localhost
- Clear browser cache (Ctrl+Shift+R)
- Restart frontend: `docker-compose restart frontend`

### Containers Won't Start
```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Common issues:
# - Missing env variables
# - Port already in use: sudo lsof -i :80 :5000
# - Missing data directory: mkdir -p /srv/app/data
```

### API Returns 404
```bash
# Check backend health
docker-compose logs backend
# Should show: "Running on http://0.0.0.0:5000"

# Test directly
curl http://localhost:5000/api/health

# Restart
docker-compose restart backend
```

### Questions Not Loading
```bash
# Verify files exist
ls -la /srv/app/data/*.json

# Check Docker mount
docker-compose exec backend ls -la /data/

# Restart backend
docker-compose restart backend
```

---

**Last Updated**: October 18, 2025  
**Status**: ✅ Production Ready
