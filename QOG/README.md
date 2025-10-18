# QOG - AI Skill Analysis & Reflection Platform 🚀

> **Q**uestion-**O**riented **G**rowth: A sophisticated platform for analyzing AI skills through structured reflection and adaptive questioning.

## 🎯 Overview

QOG is a full-stack web application deployed on GCP that helps users understand their AI interaction skills.

**Live Demo:** http://35.238.253.107

## ✨ Key Features

- **User Authentication**: Sign up and login with email/password
- **Baseline Assessment**: 3 questions to establish baseline
- **Task Management**: Create and track AI-assisted tasks  
- **Reflection Scoring**: Answer 3 random questions after each task
- **Clarity Dashboard**: Analytics with domain scores, radar charts, and metrics
- **AI Feedback**: Prompt optimization tips via Google Gemini API

## 🏗️ Tech Stack

- **Frontend**: React + TypeScript + Vite + Nginx
- **Backend**: Flask + Python 3.11 + Google Generative AI
- **Storage**: JSON Files on Persistent Volume
- **Hosting**: GCP Compute Engine (e2-micro VM)
- **Container**: Docker + Docker Compose

## 📦 Documentation

- **README.md** - This file
- **ARCHITECTURE.md** - System design and data flows
- **DOCKER_DEPLOYMENT.md** - Deployment and setup guide
- **CLARITY_DASHBOARD_CALC.md** - Scoring algorithms

## 🚀 Quick Start

### Local Development

```bash
export GEMINI_API_KEY="your-key"
docker-compose up -d
# Access at http://localhost
```

### Cloud Deployment

See `DOCKER_DEPLOYMENT.md` for complete GCP deployment guide.

## 🔑 API Endpoints

- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login
- `GET /api/baseline/questions` - Get baseline questions
- `POST /api/baseline/submit` - Submit baseline
- `GET /api/reflection/questions` - Get reflection questions
- `POST /api/reflection/submit` - Submit reflection
- `GET /api/reflection/results` - Get scores
- `GET /api/health` - Health check

## 📊 Current Status

✅ **Application Live**: http://35.238.253.107  
✅ **Frontend**: Running on port 80  
✅ **Backend**: Running on port 5000  
✅ **Database**: JSON files in persistent storage  

---

**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: October 18, 2025
