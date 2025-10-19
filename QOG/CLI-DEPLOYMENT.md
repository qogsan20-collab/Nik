# QOG CLI Deployment - Cost Optimized

This guide will deploy QOG to GCP using the most cost-effective configuration.

## Cost Breakdown
- **VM**: e2-micro (1 vCPU, 1GB RAM) - ~$5/month
- **Boot Disk**: 20GB - ~$1/month  
- **Data Disk**: 5GB - ~$0.50/month
- **Total**: ~$6.50/month

## Prerequisites
1. Google Cloud Account with billing enabled
2. gcloud CLI installed

## Step 1: Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Verify installation
gcloud version
```

## Step 2: Authenticate and Initialize

```bash
# Login to GCP
gcloud auth login

# Create a new project (or use existing)
gcloud projects create qog-app-$(date +%s) --name="QOG Application"

# Set the project (replace with your project ID)
gcloud config set project YOUR_PROJECT_ID

# Enable Compute Engine API
gcloud services enable compute.googleapis.com
```

## Step 3: Create Infrastructure

```bash
# Set variables
PROJECT_ID=$(gcloud config get-value project)
ZONE="us-central1-a"
VM_NAME="qog-vm"
DISK_NAME="qog-data-disk"

# Create data disk (5GB)
gcloud compute disks create $DISK_NAME \
    --size=5GB \
    --zone=$ZONE \
    --type=pd-standard

# Create firewall rule for HTTP
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server

# Create VM (e2-micro - smallest and cheapest)
gcloud compute instances create $VM_NAME \
    --zone=$ZONE \
    --machine-type=e2-micro \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-standard \
    --image-family=ubuntu-2004-lts \
    --image-project=ubuntu-os-cloud \
    --tags=http-server \
    --disk=name=$DISK_NAME,device-name=$DISK_NAME,mode=rw \
    --metadata=startup-script='#!/bin/bash
apt-get update
apt-get install -y git curl
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
usermod -aG docker $USER'
```

## Step 4: Get VM IP and SSH

```bash
# Get VM external IP
VM_IP=$(gcloud compute instances describe $VM_NAME \
    --zone=$ZONE \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "VM External IP: $VM_IP"

# SSH into VM
gcloud compute ssh $VM_NAME --zone=$ZONE
```

## Step 5: Set Up Data Disk (On VM)

```bash
# Format and mount the data disk
sudo mkfs.ext4 /dev/disk/by-id/google-qog-data-disk
sudo mkdir -p /srv/app/data
sudo mount /dev/disk/by-id/google-qog-data-disk /srv/app/data

# Make mount permanent
echo '/dev/disk/by-id/google-qog-data-disk /srv/app/data ext4 defaults 0 2' | sudo tee -a /etc/fstab

# Set permissions
sudo chown -R $USER:$USER /srv/app/data

# Verify mount
df -h /srv/app/data
```

## Step 6: Upload Project (From Local Machine)

```bash
# Exit SSH session first
exit

# Upload project from your local machine
gcloud compute scp --recurse ./QOG $VM_NAME:/srv/app/app --zone=$ZONE
```

## Step 7: Deploy Application (On VM)

```bash
# SSH back into VM
gcloud compute ssh $VM_NAME --zone=$ZONE

# Navigate to project
cd /srv/app/app

# Create environment file
cp env.example .env

# Edit environment file with your Gemini API key
nano .env
```

Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy the application
./deploy.sh
```

## Step 8: Verify Deployment

```bash
# Test backend health
curl http://localhost/api/health

# Test frontend
curl -I http://localhost

# Check running containers
docker compose ps
```

## Step 9: Access Your Application

```bash
# Get VM external IP
gcloud compute instances describe $VM_NAME \
    --zone=$ZONE \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Your QOG application is now available at: `http://YOUR_VM_IP`

## Quick Commands Reference

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop services
docker compose down

# Update application
git pull origin main
./deploy.sh

# Check VM status
gcloud compute instances list

# SSH into VM
gcloud compute ssh $VM_NAME --zone=$ZONE

# Delete everything (when done)
gcloud compute instances delete $VM_NAME --zone=$ZONE
gcloud compute disks delete $DISK_NAME --zone=$ZONE
gcloud compute firewall-rules delete allow-http
```

## Cost Optimization Tips

1. **Use preemptible instances** for development:
   ```bash
   --preemptible
   ```

2. **Stop VM when not in use**:
   ```bash
   gcloud compute instances stop $VM_NAME --zone=$ZONE
   gcloud compute instances start $VM_NAME --zone=$ZONE
   ```

3. **Monitor usage** in GCP Console

## Troubleshooting

```bash
# Check VM status
gcloud compute instances describe $VM_NAME --zone=$ZONE

# View startup script logs
gcloud compute instances get-serial-port-output $VM_NAME --zone=$ZONE

# Check firewall rules
gcloud compute firewall-rules list

# View project resources
gcloud compute instances list
gcloud compute disks list
```

Your QOG application is now deployed and running! 🎉


