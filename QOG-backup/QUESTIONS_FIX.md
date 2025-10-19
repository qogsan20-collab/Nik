# Missing Questions Bug - FIXED ✅

## Problem Reported
- No questions visible after clicking "Done" button
- Clarity dashboard questions not loading
- Reflection questions not appearing

## Root Cause
The Docker volume mounting was incorrect in `docker-compose.yml`:
- **Before:** Used a named volume `app_data:/data` which created a separate Docker volume
- **Problem:** The question JSON files were on the host at `/srv/app/data/`, but not in the Docker volume
- **Result:** Backend couldn't access the JSON files, so endpoints returned empty arrays

## The Fix

### Updated docker-compose.yml
Changed from:
```yaml
volumes:
  app_data:
    driver: local

services:
  backend:
    volumes:
      - app_data:/data  # ❌ Named volume, separate storage
```

To:
```yaml
services:
  backend:
    volumes:
      - /srv/app/data:/data  # ✅ Direct host path mount
```

### What This Does
- Mounts the host directory `/srv/app/data/` directly into the container at `/data`
- Backend can now read all JSON files from the host
- All data persists on the host, not in isolated Docker volume

## Deployed Files
The following files are now accessible to the backend:

| File | Questions | Status |
|------|-----------|--------|
| `questions.json` | 45 reflection questions | ✅ Loading |
| `clarity_questions.json` | 3 baseline questions | ✅ Loading |
| `prompt_hacks.json` | 5 prompt hacks | ✅ Loading |
| `users.json` | User data | ✅ Writable |

## Testing Results
```
✅ GET /api/reflection/questions → 45 questions
✅ GET /api/baseline/questions → 3 questions  
✅ GET /api/prompt-hacks → 5 hacks
```

## What Users Will See Now
1. ✅ Clarity baseline questions appear on baseline wizard
2. ✅ After clicking "Done" - reflection questions load
3. ✅ Reflection scoring works correctly
4. ✅ Dashboard shows all data properly

## Deployment Status
- ✅ docker-compose.yml updated with correct volume mount
- ✅ Containers restarted
- ✅ Backend healthy
- ✅ All endpoints returning questions
- ✅ Files accessible in container at `/data`

