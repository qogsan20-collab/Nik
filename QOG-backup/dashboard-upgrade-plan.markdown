# Dashboard Upgrade Plan

## Current State Snapshot
- `ClarityDashboard.tsx` fetches `/api/reflection/results` and `/api/reflection/questions` on mount, then derives scores client-side (`computeScore`, `buildDomainSummaries`).
- Layout uses static CSS cards; the radar chart and histogram placeholders are simple divs rather than real visualisations.
- Dashboard data only loads once. When reflections are submitted the modal closes and the dashboard is shown, but the component does not refetch results, so insights can be stale until a full reload.
- Result records in `backend/results.json` now include both `reflection` and `baseline` contexts; the dashboard currently mixes them for scoring but intentionally filters time/iteration metrics to reflections only.

## Target Experience (per new mockups)
- Rich visual cards for reasoning scores, including radial gauges and an actual radar chart.
- A horizontal histogram for task iterations (matching the Matplotlib reference).
- Always-on sync so submitting a baseline or reflection immediately updates the dashboard.
- Expanded detail cards (Prompt Hack, trust/reliance gauges, etc.) fed directly from `results.json` aggregates.

## Work Breakdown

### Data Layer
- [ ] Create a dedicated dashboard data service (e.g. `src/services/dashboard.ts`) that wraps the fetches and exposes typed helpers: `getResults()`, `getQuestionMap()`, `computeAggregates(results)`.
- [ ] Extend aggregate helpers to produce:
  - Domain leaderboard (top style + supporting domains with subtitles).
  - Per-domain score lookup (for gauges and cards).
  - Engagement metrics: week-to-date duration, overall totals, average iterations, streaks (if desired).
  - Histogram dataset (bucket + count pairs) formatted for the charting lib.
  - Radar chart dataset (consistent ordering, normalization to 0–100).
- [ ] Add a lightweight event or timestamp signal in app state (e.g. `lastInsightsUpdate`) that increments after baseline or reflection submissions so the dashboard can refetch when it becomes active.

### Backend (optional refinements)
- [ ] Consider pagination or memoised aggregates if `results.json` grows; currently all records are returned raw.
- [ ] Optionally expose `/api/dashboard/summary` that ships precomputed aggregates to reduce frontend work (nice-to-have if performance becomes an issue).

### Frontend UI & Components
- [ ] Replace the existing static cards with a responsive grid that mirrors the new design (top highlight card + secondary cards in rows).
- [ ] Integrate a charting library:
  - Radar chart: e.g. `recharts` (`RadarChart`, `PolarGrid`, `Radar`).
  - Gauge cards: custom SVG arc or a lightweight library (ECharts gauge) — evaluate bundle impact.
  - Histogram: horizontal bar chart using the same library for consistency.
- [ ] Abstract visual widgets into reusable components (`ScoreCard`, `GaugeCard`, `HistogramCard`, `RadarProfileCard`) for clarity and future iteration.
- [ ] Implement the prompt tip / hack of the day card, pulling from either static copy or a generated selection based on lowest domain.
- [ ] Ensure typography, spacing, and CTA buttons match the provided design (update `Dashboard.css` or migrate to CSS modules / Tailwind as needed).

### Interaction & Updates
- [ ] When `ReflectionModal` resolves, trigger the global `lastInsightsUpdate` signal before routing to the dashboard.
- [ ] If the user completes the baseline wizard, also trigger the same update so the dashboard reflects their baseline scores immediately.
- [ ] Add loading/empty/error states for the new components (skeletons or subtle spinners).

### Validation
- [ ] Time-travel test: submit multiple reflections with different combinations of Likert/MCQ to confirm gauges and radar respond correctly.
- [ ] Verify histogram buckets align with Matplotlib reference by comparing counts against manual calculations.
- [ ] Confirm domain scores respect the `context` flag (include baseline in reasoning profile but exclude it from time/iteration cards).
- [ ] Run visual regression checks (manual screenshots or Percy if available) to confirm layout parity with mockups.

### History Enhancements
- [ ] When persisting reflection/baseline submissions, capture the active task metadata (name, category). Either enrich `results.json` records at submission time or resolve the `task_id` on the dashboard by hitting `/api/get-task/<id>`.
- [ ] Update the dashboard history table to surface task name and category (fallback gracefully if missing or baseline context).
- [ ] Add historical-comparison helpers (e.g., week-over-week overall score deltas, moving averages) so the new visuals can illustrate trends over time.

### Open Questions / Decisions
- Multi-user support: future requirement. Current implementation remains single-profile but keep services/component APIs flexible enough to slot in a user identifier later.
- Prompt hack card: drive from a new JSON dataset (e.g., `backend/prompt_hacks.json`) and surface context-aware suggestions based on lowest-performing domain or recency.
- Historical comparisons are required—final design should include week-over-week deltas or similar trend indicators driven by the new aggregate helpers.
