# QOG Chatbot

A modern AI-powered chatbot application with a clean, intuitive interface powered by Google's Gemini 2.0 API.

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
- Google Generative AI (Gemini 2.0)
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
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## Usage

1. **Create a New Task**: Click "New Task +" in the sidebar to create a new conversation
2. **Send Messages**: Type your message in the input field and press Enter or click Send
3. **Switch Tasks**: Use the "Previous Tasks" dropdown to switch between different conversations
4. **Track Progress**: View iteration count and time spent on each task
5. **Complete Tasks**: Click "Done" to mark a task as complete

## API Endpoints

- `POST /api/new-task` - Create a new task
- `POST /api/send-message` - Send a message to the current task
- `GET /api/get-task/<task_id>` - Get a specific task
- `GET /api/get-all-tasks` - Get all tasks
- `POST /api/complete-task` - Mark a task as complete
- `POST /api/switch-task` - Switch to a different task
- `GET /api/health` - Health check

## Configuration

The Gemini API key is configured in `backend/app.py`. To use your own key:

1. Replace the `GEMINI_API_KEY` variable in `backend/app.py`
2. Or set it as an environment variable: `export GEMINI_API_KEY="your-key-here"`

## Project Structure

```
QOG/
├── backend/
│   ├── app.py              # Flask backend with Gemini integration
│   └── requirements.txt    # Python dependencies
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx     # Left sidebar component
│   │   └── ChatView.tsx    # Main chat interface
│   ├── styles/
│   │   ├── App.css         # Global styles
│   │   ├── Sidebar.css     # Sidebar styles
│   │   └── ChatView.css    # Chat interface styles
│   └── App.tsx             # Main application component
├── start.sh                # Startup script
└── README.md              # This file
```

## Development

- The frontend runs on Vite with hot reload
- The backend runs on Flask with debug mode enabled
- Both servers restart automatically when files change

## Troubleshooting

1. **Backend not starting**: Make sure Python 3.7+ is installed and the virtual environment is activated
2. **Frontend not connecting**: Ensure the backend is running on port 5000
3. **API errors**: Check the browser console and backend logs for error messages
4. **Gemini API errors**: Verify your API key is correct and has sufficient quota

## License

This project is for demonstration purposes.

