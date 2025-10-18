# QOG Application - Technical Architecture 🏗️

## System Overview

```
User Browser (http://35.238.253.107)
         ↓
    [Nginx - Port 80]
    (Reverse Proxy)
         ↓
    ┌────┴────┐
    ↓         ↓
Frontend   Backend
(React)    (Flask)
Port 80    Port 5000
    ↓         ↓
    └────┬────┘
         ↓
  Persistent Volume
   /srv/app/data
  (JSON Files)
```

## Architecture Components

### 1. Frontend Container 🎨
- **Base**: Node.js 18 Alpine (builder) + Nginx Alpine (runtime)
- **Framework**: React + TypeScript + Vite
- **Server**: Nginx (Reverse proxy + static serving)
- **Port**: 80
- **Features**:
  - Build-time API URL injection
  - SPA routing support
  - Static asset compression
  - API proxying to backend

### 2. Backend Container 🔧
- **Base**: Python 3.11 Slim
- **Framework**: Flask
- **Port**: 5000
- **Key Libraries**:
  - google-generativeai (Gemini API)
  - Flask-CORS
  - python-dotenv
- **Features**:
  - RESTful API endpoints
  - JSON data persistence
  - Health checks
  - Gemini API integration

### 3. Data Persistence 💾
- **Location**: /srv/app/data (Host) → /data (Container)
- **Format**: JSON files
- **Files**:
  - users.json - User accounts
  - questions.json - 45 reflection questions
  - clarity_questions.json - 3 baseline questions
  - results.json - Reflection scores
  - clarity_results.json - Baseline scores
  - prompt_hacks.json - 5 AI tips
  - onboarding_responses.json - Baseline tracking

### 4. Network Architecture 🌐
- **Docker Bridge Network**: app_default
- **Frontend IP**: 172.18.0.3
- **Backend IP**: 172.18.0.2
- **External Access**: Port 80 (HTTP)
- **GCP Firewall**: Allows :80, :443, :22

## Data Flows

### Authentication Flow
```
User Login Form
     ↓
POST /api/auth/login
     ↓
Flask validates credentials
     ↓
Checks users.json
     ↓
Returns user_id + token
     ↓
Frontend stores in localStorage
```

### Reflection Submission Flow
```
User completes task
     ↓
Clicks "Start reflection"
     ↓
Answers 3 random questions
     ↓
POST /api/reflection/submit
     ↓
Backend calculates score
     ↓
Appends to results.json
     ↓
Returns score to frontend
```

### Dashboard Data Flow
```
User opens Dashboard
     ↓
GET /api/reflection/results
GET /api/reflection/questions
GET /api/prompt-hacks
     ↓
Backend aggregates data
     ↓
Computes domain summaries
     ↓
Returns complete dashboard state
     ↓
Frontend renders charts/metrics
```

## Deployment Architecture

### Container Images
- **Frontend**: ~200MB (nginx + static files)
- **Backend**: ~500MB (python + dependencies)
- **Total**: ~700MB

### VM Configuration
- **Machine Type**: e2-micro
- **vCPU**: 0.25-2 vCPU
- **RAM**: 1GB
- **Boot Disk**: 20GB
- **Data Disk**: 10GB

### Resource Usage
- Nginx: ~50MB
- Backend: ~200MB
- System: ~300MB
- Available: ~450MB

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Cloud | GCP Compute Engine | e2-micro |
| Container | Docker Compose | Latest |
| Frontend | React + Vite | 18 + 4.5 |
| Backend | Flask | 2.3.3 |
| AI API | Google Generative AI | 0.3.2 |
| Language | TypeScript/Python | Latest |
| Web Server | Nginx | Alpine |

---

**Status**: ✅ Production Ready  
**Last Updated**: October 18, 2025
