#!/bin/bash

# Start the Python backend
PORT=5050
FALLBACK_PORT=0
echo "Starting Python backend..."
cd backend
if [ -d "venv" ]; then
  rm -rf venv
fi
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip setuptools >/dev/null
pip install -r requirements.txt >/dev/null
if lsof -nP -iTCP:$PORT >/dev/null 2>&1; then
  echo "Port $PORT already in use. Attempting to free it..."
  lsof -nP -iTCP:$PORT | awk 'NR>1 {print $2}' | xargs -r kill -9
  sleep 1
fi
if lsof -nP -iTCP:$PORT >/dev/null 2>&1; then
  echo "Port $PORT still in use. Choosing fallback port automatically."
  while lsof -nP -iTCP:$PORT >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done
  FALLBACK_PORT=$PORT
fi
export PORT
python app.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start the React frontend
echo "Starting React frontend..."
cd ..
npm run dev &
FRONTEND_PID=$!

echo "Both servers are starting..."
echo "Backend: http://localhost:$PORT"
echo "Frontend: http://localhost:5183"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
wait

# Cleanup
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null



