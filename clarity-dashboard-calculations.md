
This note captures how each metric on the refreshed dashboard is produced. All calculations run client-side in `src/components/ClarityDashboard.tsx` using the data returned from `fetchDashboardSource()` (`/api/reflection/results`, `/api/reflection/questions`, `/api/prompt-hacks`).

## Source Data
- **Records:** Every baseline or reflection submission (`DashboardRecord`). Each record includes:
  - `context`: `"baseline"` or `"reflection"`.
  - `score`: persisted overall/likert/mcq scores (fallback is recomputed on load).
  - `iterations`, `duration`, `task_meta` (name/category captured at submission).
- **Questions:** Question bank metadata, including `type`, `domain`, scale ranges, and any `(reverse scored)` cues embedded in the copy.
- **Prompt Hacks:** Domain-tagged suggestions for the “Prompt hack of the day” card.

## Normalising Answers
1. Every answer is converted to a 0–100 score:
   - **Likert / Scales:** `(value - min) / (max - min) * 100` using the declared `scale.min`/`scale.max`.
   - If the question text contains “reverse scored”, the value is inverted: `score = (1 - normalised) * 100`.
   - **Single/Multi Choice:** The % of selected options marked with `(+1)`.
2. Each record’s overall score = mean(likert_mean, mcq_mean) where both exist; otherwise whichever subset is present.

## Domain Summaries
- Aggregation groups answers by `question.domain`.
- For each domain we store:
  - `overall`: average of likert/mcq domain means.
  - `likert` / `mcq`: the average of just those question types (null if none).
  - `responses`: number of answers rolled into the domain.
- These summaries feed:
  - Highlight card (highest `overall` domain).
  - Secondary domain cards (next three by score).
  - Gauge cards (Reliance & Trust pull the relevant domain entry).
  - Radar chart (top five domains, sorted desc by `overall`).
  - Prompt hack selection (lowest domain).

## Weekly Trend Block
- Reflections only (`context !== 'baseline'`).
- Time windows: `currentWeek = now - 7 days`, `previousWeek = now - 14 … now - 7`.
- Metrics:
  - `currentAvg`: average `score.overall` in current week.
  - `previousAvg`: same for prior week.
  - `delta`: `currentAvg - previousAvg` (displayed on highlight card badge).
  - `durationSeconds`: sum of `duration` for current week.
  - `iterationsAvg`: mean iterations for current week.
  - `sampleCount`: number of reflections in current week.
- `formatDurationDetailed` converts `durationSeconds` to `xh ym`.

## Histogram (Iterations)
- Reflections only.
- Buckets by integer `iterations`, counts occurrences.
- Bar length = `(count / totalReflections) * 100` (clamped to ensure visibility).
- Footer shows overall average iterations across every reflection (`overallIterationsAverage`).

## Gauge Cards
- Reliance / Trust use the associated domain `overall` score (0–100).
- Presentation:
  - Semi-circle progress arc uses `value / 100`.
  - Zones:
    - `>= 80` → High
    - `60–79` → Balanced
    - `40–59` → Moderate
    - `< 40` → Low
  - Missing data → “No data yet”.

## Radar Profile
- Takes up to the top five domain summaries.
- Each axis is a domain score (0–100).
- If no domain data exists, a friendly empty state is shown.

## Prompt Hack
- Pick the lowest-scoring domain summary.
- Look up the matching entry in the prompt hack dataset; fall back to the first hack if none matches.
- Card surfaces title, description, and optional example.

## Key Insight Cards
- **Strength:** copy pulled from `domainNarratives[bestDomain]`.
- **Growth focus:** copy from `domainNarratives[weakestDomain]`.
- **Workflow rhythm:** heuristic:
  - No reflections this week → encourage first check-ins.
  - `iterationsAvg >= 3` → congratulate iteration cadence.
  - Otherwise prompt for an extra iteration.

## History Table
- Shows every record (baseline + reflections) sorted newest first.
- Columns:
  - Date (`formatDateShort`).
  - Task name (`task_meta.name` or fallback).
  - Category (`task_meta.category` or `—` for baseline).
  - Score (overall %).
  - Iterations / Time (blank for baseline records).

## Baseline vs Reflection Handling
- Baseline entries contribute to domain scores and overall averages (they represent initial benchmark answers).
- Time/iteration metrics intentionally exclude baseline (`reflectionRecords` filter).
- History labels baseline entries as “Baseline Onboarding” with blank iteration/time cells.

## Demo Mode note
- `DEMO_ALWAYS_SHOW_BASELINE` (in `App.tsx`) forces the baseline wizard to appear after every refresh. Remove or gate by auth once user profiles are introduced.
