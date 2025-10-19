# QOG Deployment Guide - GCP Compute Engine

This guide will help you deploy the QOG application on Google Cloud Platform using a single VM with Docker Compose.

## Architecture Overview

- **Single VM**: Runs both frontend and backend services
- **Docker Compose**: Orchestrates services with shared data volume
- **Nginx Proxy**: Routes `/api` to Flask backend, `/` to React frontend
- **Persistent Storage**: JSON files stored in mounted volume
- **Single Endpoint**: One public URL for the entire application

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed locally
3. **Gemini API Key** for the backend

## Step 1: Set Up GCP

### Install gcloud CLI
```bash
# macOS
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### Initialize and Configure
```bash
# Login to GCP
gcloud auth login

# Initialize gcloud
gcloud init

# Create or select a project
gcloud projects create qog-app --name="QOG Application"
gcloud config set project qog-app

# Enable required APIs
gcloud services enable compute.googleapis.com
```

## Step 2: Provision VM and Storage

### Create Persistent Data Disk
```bash
# Create a 5GB data disk for JSON files (cost-optimized)
gcloud compute disks create qog-data-disk \
    --size=5GB \
    --zone=us-central1-a \
    --type=pd-standard
```

### Create Firewall Rules
```bash
# Allow HTTP traffic
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server

# Allow HTTPS traffic (optional)
gcloud compute firewall-rules create allow-https \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags https-server
```

### Create VM Instance (Cost-Optimized)
```bash
# Create VM with both boot disk and data disk - using smallest machine type
gcloud compute instances create qog-vm \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-standard \
    --image-family=ubuntu-2004-lts \
    --image-project=ubuntu-os-cloud \
    --tags=http-server,https-server \
    --disk=name=qog-data-disk,device-name=qog-data-disk,mode=rw \
    --metadata=startup-script='#!/bin/bash
apt-get update
apt-get install -y git curl
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
usermod -aG docker $USER'
```

## Step 3: Prepare VM

### SSH into VM
```bash
# Get external IP
gcloud compute instances describe qog-vm \
    --zone=us-central1-a \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# SSH into VM
gcloud compute ssh qog-vm --zone=us-central1-a
```

### Set Up Data Disk
```bash
# Format and mount the data disk
sudo mkfs.ext4 /dev/disk/by-id/google-qog-data-disk
sudo mkdir -p /srv/app/data
sudo mount /dev/disk/by-id/google-qog-data-disk /srv/app/data

# Make mount permanent
echo '/dev/disk/by-id/google-qog-data-disk /srv/app/data ext4 defaults 0 2' | sudo tee -a /etc/fstab

# Set permissions
sudo chown -R $USER:$USER /srv/app/data
```

### Install Docker (if not already installed)
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Install docker-compose plugin
sudo apt install -y docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
```

## Step 4: Upload Project

### Option A: Git Clone (Recommended)
```bash
# SSH back into VM
gcloud compute ssh qog-vm --zone=us-central1-a

# Clone your repository
cd /srv/app
git clone https://github.com/yourusername/qog-repo.git app
cd app
```

### Option B: Upload from Local Machine
```bash
# From your local machine
gcloud compute scp --recurse ./QOG qog-vm:/srv/app/app --zone=us-central1-a
```

## Step 5: Configure Environment

### Create Environment File
```bash
# On the VM
cd /srv/app/app

# Copy environment template
cp env.example .env

# Edit with your Gemini API key
nano .env
```

Add your Gemini API key:
```
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### Verify Data Directory
```bash
# Ensure data directory exists and is writable
mkdir -p /srv/app/data/task_history
chmod 755 /srv/app/data
```

## Step 6: Deploy Application

### Run Deployment Script
```bash
# Make deployment script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### Manual Deployment (Alternative)
```bash
# Build and start services
docker compose up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

## Step 7: Validate Deployment

### Test Backend API
```bash
# Test health endpoint
curl http://localhost/api/health

# Expected response:
# {"status": "healthy", "message": "QOG Chatbot API is running"}
```

### Test Frontend
```bash
# Test frontend
curl -I http://localhost

# Expected: HTTP 200 OK
```

### Get External Access
```bash
# Get VM external IP
gcloud compute instances describe qog-vm \
    --zone=us-central1-a \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Your application will be accessible at: `http://YOUR_VM_EXTERNAL_IP`

## Step 8: Production Hardening

### Set Up HTTPS (Optional)
```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com
```

### Set Up Auto-start
```bash
# Create systemd service
sudo tee /etc/systemd/system/qog-app.service > /dev/null <<EOF
[Unit]
Description=QOG Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/srv/app/app
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable qog-app.service
sudo systemctl start qog-app.service
```

### Set Up Backups
```bash
# Create backup script
sudo tee /usr/local/bin/backup-qog.sh > /dev/null <<EOF
#!/bin/bash
BACKUP_DIR="/srv/backups"
DATE=\$(date +%Y%m%d_%H%M%S)
mkdir -p \$BACKUP_DIR
tar -czf \$BACKUP_DIR/qog-data-\$DATE.tar.gz -C /srv/app/data .
find \$BACKUP_DIR -name "qog-data-*.tar.gz" -mtime +7 -delete
EOF

sudo chmod +x /usr/local/bin/backup-qog.sh

# Add to crontab for daily backups
echo "0 2 * * * /usr/local/bin/backup-qog.sh" | sudo crontab -
```

## Monitoring and Maintenance

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
./deploy.sh
```

### Scale Resources
```bash
# Resize VM
gcloud compute instances set-machine-type qog-vm \
    --machine-type=e2-standard-2 \
    --zone=us-central1-a

# Resize data disk
gcloud compute disks resize qog-data-disk \
    --size=20GB \
    --zone=us-central1-a
```

## Troubleshooting

### Common Issues

1. **Port 80 already in use**
   ```bash
   sudo lsof -i :80
   sudo systemctl stop apache2  # or nginx
   ```

2. **Docker permission denied**
   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in
   ```

3. **Data disk not mounted**
   ```bash
   sudo mount -a
   df -h  # Check if /srv/app/data is mounted
   ```

4. **Backend not responding**
   ```bash
   docker compose logs backend
   docker compose restart backend
   ```

### Health Checks
```bash
# Check all services
docker compose ps

# Test API endpoints
curl http://localhost/api/health
curl http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"test","password":"test"}'
```

## Cost Optimization

- **Preemptible instances**: Use for development/testing
- **Sustained use discounts**: Automatic for long-running instances
- **Right-sizing**: Monitor usage and adjust machine type
- **Storage optimization**: Use appropriate disk types

## Security Considerations

- **Firewall rules**: Only open necessary ports
- **API keys**: Store securely in environment variables
- **Regular updates**: Keep system and Docker images updated
- **Backups**: Regular automated backups of data
- **HTTPS**: Use SSL certificates for production

## Support

For issues or questions:
1. Check application logs: `docker compose logs -f`
2. Verify environment variables: `cat .env`
3. Test individual services: `curl http://localhost/api/health`
4. Check VM resources: `htop`, `df -h`

Your QOG application is now deployed and ready to use! 🎉
