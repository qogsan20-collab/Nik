# Baseline Onboarding Integration Plan

## Current Flow Snapshot
- `src/main.tsx` renders `App`, which immediately mounts `Sidebar` and either `ChatView` or `ClarityDashboard`.
- Task lifecycle is session-based; new tasks are created through `Sidebar`, and chat history lives in memory on the Flask backend (`backend/app.py`).
- Reflection moments already use a modal pattern (`ReflectionModal`) that fetches question data from `/api/reflection/questions`.

## Objectives
- Gate the primary workspace behind a short baseline calibration for first-time users.
- Collect multi-step questionnaire responses that map to cognitive domains and feed future insights.
- Persist completion status so returning users bypass the baseline wizard.

## Task List

### Frontend
- [ ] Add persistent state (e.g., `baselineComplete`) that is loaded on boot (local storage now, API later) and guards rendering of the main app shell.
- [ ] Build a `BaselineWizard` component that orchestrates the screens shown in the provided mockups (welcome, calibration loader, multi-step questions, completion).
- [ ] Pull the shared question bank from the backend and randomly select a 10-question baseline set per session.
- [ ] Implement question-step UI using existing reflection patterns (progress indicator, navigation controls, multi-select & single-select inputs).
- [ ] Capture answers locally and submit them through a new API call before unlocking the workspace.
- [ ] Style the wizard (new CSS module) with full-screen overlay behaviour and responsive layouts consistent with current design tokens.

### Backend
- [ ] Create endpoints to serve baseline question bundles (`/api/baseline/questions`) and accept submissions (`/api/baseline/submit`).
- [ ] On the questions endpoint, sample any 10 entries from `questions.json` (reuse reflection bank) and return them in randomized order.
- [ ] Persist baseline submissions into the existing `results.json`, tagging each record with a `context` field (`"baseline"` or `"reflection"`) for downstream filtering.
- [ ] Extend submission handling to include scoring hooks if needed by the dashboard and return a `baselineComplete` flag.

### Integration & Persistence
- [ ] Extend dashboard data model to ingest `results.json` entries regardless of context, combining baseline and reflection responses when computing insights.
- [ ] Record completion status in local storage immediately and reconcile with backend flag on subsequent loads.
- [ ] Handle skip flows (user can defer baseline once, receives reminders later) without blocking core chat tasks.

### Validation
- [ ] Unit-test helper utilities (state management, persistence wrappers) and add integration test for wizard flow with mocked fetch.
- [ ] Manually verify: first-visit onboarding, resume after refresh mid-wizard, skip path, subsequent visits bypass wizard.
- [ ] Update documentation (README or onboarding guide) with setup notes for baseline data files and API usage.

## Implementation Notes
- Reuse `backend/app.py` helpers (`read_json_file`, `write_json_file`) to minimise boilerplate for baseline storage.
- Sample from the existing `questions.json` so both baseline and reflections draw from the same maintained bank (introduce optional `"context"` tagging later if needed).
- Introduce a lightweight client-side service (e.g., `src/services/onboarding.ts`) to abstract fetch calls and local storage access.
- The wizard should be resilient to empty question sets (fallback messaging and unlock on success).
- Demo mode toggle (current state): force the wizard to display on every new browser session by ignoring cached completion flags; revisit once auth-backed profiles land.

## Open Questions
- Should baseline data seed the Clarity Dashboard immediately, or remain separate until enough reflections exist?
- How is user identity managed long-term (email, auth)? Presently hard-coded; plan assumes single-user/local mode.
- What is the desired cadence for re-running the baseline (e.g., prompt every quarter)?
