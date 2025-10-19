#!/bin/bash

# QOG Deployment Script for GCP Compute Engine
# This script helps deploy the QOG application using Docker Compose

set -e

echo "🚀 QOG Deployment Script"
echo "========================"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please copy env.example to .env and add your GEMINI_API_KEY:"
    echo "  cp env.example .env"
    echo "  nano .env"
    exit 1
fi

# Load environment variables
source .env

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ]; then
    echo "❌ GEMINI_API_KEY not set in .env file!"
    echo "Please add your actual Gemini API key to the .env file."
    exit 1
fi

echo "✅ Environment configuration validated"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker compose down --remove-orphans || true

# Build and start services
echo "🔨 Building and starting services..."
docker compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker compose ps

# Test backend health
echo "🏥 Testing backend health..."
if curl -f http://localhost/api/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    echo "Backend logs:"
    docker compose logs backend
    exit 1
fi

# Test frontend
echo "🌐 Testing frontend..."
if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend check failed"
    echo "Frontend logs:"
    docker compose logs frontend
    exit 1
fi

echo ""
echo "🎉 Deployment successful!"
echo "========================="
echo "Your QOG application is now running at:"
echo "  🌐 Frontend: http://localhost"
echo "  🔧 Backend API: http://localhost/api"
echo "  🏥 Health Check: http://localhost/api/health"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop the application:"
echo "  docker compose down"
echo ""
echo "To update the application:"
echo "  ./deploy.sh"


