# QOG Chatbot

Modern AI assistant with a React (Vite + TS) frontend and a Flask backend using Google Gemini. This README includes quick local dev, GitHub push (UI), and easy Cloud Run deploy steps with minimal changes.

## Features

- 🤖 **AI-Powered**: Powered by Google Gemini 2.0 for intelligent responses
- 📊 **Progress Tracking**: Monitor iterations and time spent on tasks
- 📁 **Task Management**: Create, organize, and switch between multiple tasks
- 🎨 **Modern UI**: Clean, responsive design matching the provided mockup
- ⚡ **Real-time**: Live chat interface with instant responses
- 📱 **Responsive**: Works on desktop and mobile devices

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for fast development
- Lucide React for icons
- CSS3 with custom properties

### Backend
- Python Flask
- Google Generative AI (Gemini 2.x via `google-generativeai`)
- CORS enabled for cross-origin requests

## Quick Start

### Option 1: Use the startup script (Recommended)
```bash
./start.sh
```

### Option 2: Manual setup

1. **Start the Python backend:**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python app.py
   ```

2. **Start the React frontend (in a new terminal):**
   ```bash
   npm install
   npm run dev
   ```

3. **Open your browser:**
   - Frontend: http://localhost:5173 (default Vite dev port)
   - Backend API: http://localhost:5050 (Flask dev server)

## Usage

1. **Create a New Task**: Click "New Task +" in the sidebar to create a new conversation
2. **Send Messages**: Type your message in the input field and press Enter or click Send
3. **Switch Tasks**: Use the "Previous Tasks" dropdown to switch between different conversations
4. **Track Progress**: View iteration count and time spent on each task
5. **Complete Tasks**: Click "Done" to mark a task as complete

## API Endpoints (Backend)

- `POST /api/new-task` - Create a new task
- `POST /api/send-message` - Send a message to the current task
- `GET /api/get-task/<task_id>` - Get a specific task
- `GET /api/get-all-tasks` - Get all tasks
- `POST /api/complete-task` - Mark a task as complete
- `POST /api/switch-task` - Switch to a different task
- `GET /api/health` - Health check

## Configuration

- Backend requires `GEMINI_API_KEY`.
  - Local: create `QOG/backend/local.env` with `GEMINI_API_KEY=...` (already read by the app) or export in your shell.
  - Cloud Run: store in Secret Manager and set `GEMINI_API_KEY` via `--set-secrets GEMINI_API_KEY=gemini-api-key:latest` (see Deploy section).

- Frontend API base URL:
  - The app reads `VITE_API_URL` at build/runtime for requests to the backend.
  - Defaults to `http://localhost:5050/api` when unset.

## Project Structure

```
QOG/
├── backend/
│   ├── app.py              # Flask backend with Gemini integration
│   └── requirements.txt    # Python dependencies
│
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx     # Left sidebar component
│   │   └── ChatView.tsx    # Main chat interface
│   ├── styles/
│   │   ├── App.css         # Global styles
│   │   ├── Sidebar.css     # Sidebar styles
│   │   └── ChatView.css    # Chat interface styles
│   └── App.tsx             # Main application component
│
├── Dockerfile              # Container for backend (Cloud Run)
├── .dockerignore           # Keeps Docker builds small
├── .gitignore              # Keeps repo clean
├── start.sh                # Startup script
└── README.md              # This file
```

## Development

- Frontend runs on Vite with hot reload (default port 5173)
- Backend runs on Flask with debug mode on port 5050
- Both restart automatically on file changes

## Push To GitHub (UI-only)

Pick one of these UI approaches:

- GitHub Desktop (recommended):
  - Open GitHub Desktop → File → Add Local Repository → choose the `QOG` folder.
  - Ensure `.gitignore` is present so `node_modules/` and `backend/venv/` are ignored.
  - Commit → Publish repository → choose name/visibility.

- GitHub.com (manual upload):
  - Create a new repo (no README).
  - Click “uploading an existing file” and drag contents of `QOG/`, excluding: `node_modules/`, `backend/venv/`, `dist/`, `backend/qog.db`, `backend/task_history/`, and any `.env` files.

## Deploy To Google Cloud Run (minimal changes)

You can deploy backend and frontend as separate Cloud Run services.

### 1) Backend (Flask) → Cloud Run

Prerequisites:
- gcloud installed and authenticated; billing enabled.
- Gemini key in Secret Manager: `echo -n "<YOUR_GEMINI_API_KEY>" | gcloud secrets create gemini-api-key --data-file=- --replication-policy=automatic`

Deploy using the included script:
- From `QOG/` run:
  - `export PROJECT_ID=<your-gcp-project-id>`
  - `export REGION=us-central1`
  - `export GEMINI_SECRET_NAME=gemini-api-key`
  - `./deploy_cloud_run.sh`

The script builds the image from `QOG/Dockerfile`, deploys, and prints the Cloud Run URL (e.g., `https://qog-web-xxxxx-uc.a.run.app`).

### 2) Frontend (React) → Cloud Run (buildpacks)

The frontend reads `VITE_API_URL` to reach the backend.

Option A: gcloud CLI
- From `QOG/` run:
  - `export REGION=us-central1`
  - `export BACKEND_API=https://<your-backend>/api`
  - `gcloud run deploy qog-frontend --source . --region $REGION --allow-unauthenticated --set-env-vars VITE_API_URL=$BACKEND_API`

Option B: Cloud Console UI
- Cloud Run → Create service → Deploy one revision from source.
- Connect your GitHub repo (if prompted).
- Set Service name: `qog-frontend`, Region.
- Set environment variable: `VITE_API_URL = https://<your-backend>/api`.
- Deploy.

## Data Persistence Notes

The backend currently writes JSON files under `backend/` (e.g., users.json, task_history, results.json). On Cloud Run, the filesystem is ephemeral and not shared across instances. For production, move data to managed services:
- Firestore (operational data: users, tasks, history)
- BigQuery (analytics/results)
- Cloud Storage (JSON snapshots/backups)

## Troubleshooting

1. **Backend not starting**: Make sure Python 3.7+ is installed and the virtual environment is activated
2. **Frontend not connecting**: Ensure the backend is running on port 5050 locally, or set `VITE_API_URL` to your Cloud Run backend URL.
3. **API errors**: Check the browser console and backend logs for error messages
4. **Gemini API errors**: Verify your API key is correct and has sufficient quota

## License

This project is for demonstration purposes.
