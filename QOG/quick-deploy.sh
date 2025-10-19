#!/bin/bash

# QOG Quick Deploy Script - Cost Optimized
# This script deploys QOG to GCP with minimal cost configuration

set -e

echo "🚀 QOG Quick Deploy - Cost Optimized"
echo "===================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found!"
    echo "Please install gcloud CLI first:"
    echo "  brew install google-cloud-sdk"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 Please authenticate with GCP first:"
    echo "  gcloud auth login"
    exit 1
fi

# Set variables
PROJECT_ID="qog-app-$(date +%s)"
ZONE="us-central1-a"
VM_NAME="qog-vm"
DISK_NAME="qog-data-disk"

echo "📋 Configuration:"
echo "  Project: $PROJECT_ID"
echo "  Zone: $ZONE"
echo "  VM: e2-micro (1 vCPU, 1GB RAM)"
echo "  Boot Disk: 20GB"
echo "  Data Disk: 5GB"
echo ""

# Create project
echo "🏗️  Creating GCP project..."
gcloud projects create $PROJECT_ID --name="QOG Application"
gcloud config set project $PROJECT_ID

# Enable billing (user needs to do this manually)
echo "💳 Please enable billing for project $PROJECT_ID:"
echo "  1. Go to: https://console.cloud.google.com/billing"
echo "  2. Select project: $PROJECT_ID"
echo "  3. Link a billing account"
echo ""
read -p "Press Enter after enabling billing..."

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable compute.googleapis.com

# Create data disk
echo "💾 Creating data disk..."
gcloud compute disks create $DISK_NAME \
    --size=5GB \
    --zone=$ZONE \
    --type=pd-standard

# Create firewall rules
echo "🔥 Creating firewall rules..."
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server

# Create VM
echo "🖥️  Creating VM instance..."
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

# Wait for VM to be ready
echo "⏳ Waiting for VM to be ready..."
sleep 30

# Get VM external IP
VM_IP=$(gcloud compute instances describe $VM_NAME \
    --zone=$ZONE \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "✅ VM created successfully!"
echo "🌐 External IP: $VM_IP"
echo ""
echo "📋 Next steps:"
echo "1. SSH into VM:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "2. Set up data disk:"
echo "   sudo mkfs.ext4 /dev/disk/by-id/google-$DISK_NAME"
echo "   sudo mkdir -p /srv/app/data"
echo "   sudo mount /dev/disk/by-id/google-$DISK_NAME /srv/app/data"
echo "   echo '/dev/disk/by-id/google-$DISK_NAME /srv/app/data ext4 defaults 0 2' | sudo tee -a /etc/fstab"
echo "   sudo chown -R \$USER:\$USER /srv/app/data"
echo ""
echo "3. Upload your project:"
echo "   gcloud compute scp --recurse ./QOG $VM_NAME:/srv/app/app --zone=$ZONE"
echo ""
echo "4. Deploy application:"
echo "   cd /srv/app/app"
echo "   cp env.example .env"
echo "   nano .env  # Add your GEMINI_API_KEY"
echo "   ./deploy.sh"
echo ""
echo "🎉 Your app will be available at: http://$VM_IP"
echo ""
echo "💰 Estimated monthly cost: ~$5-8 (e2-micro + storage)"


