# Reasoning Style Scoring Overview

This document explains how the product measures reasoning skills from the reflection questionnaire. It links the question bank to the score calculations in both the backend (`/backend/app.py`) and frontend (`/src/components/ClarityDashboard.tsx`), and finishes with a worked example.

## Question Bank

- Source: `backend/questions.json`
- Each entry defines:
  - `id`: stable identifier (e.g. `C1`)
  - `type`: `scale`, `single`, or `multi`
  - `domain`: reasoning style bucket (Analytical, Critical, Flexibility, etc.)
  - `question`: the prompt shown to the user
  - `scale` (for Likert items): numeric range `{ "min": 1, "max": 5 }`
- `options` (for MCQs): text choices; positive answers are marked with `(+1)`
- Reverse‑scored items are noted in the question text with “(reverse scored)”.

### Example Questions by Domain

- **Analytical**: `C1` “I broke down my problem into smaller parts.” (scale); `C4` “When exploring a new feature in AI, I would: … (+1)” (single).
- **Critical**: `E2` “I checked if the AI’s explanation was backed by evidence or reasoning.” (scale); `E4` “When the AI gave me an answer, I: … (+1)” (single).
- **Flexibility**: `F3` “I quickly adapted when the AI suggested something unexpected.” (scale); `F4` “If the AI suggested a different solution… (+1)” (single).
- **Inductive**: `A2` “I tried to generalize from the AI’s specific outputs to broader ideas.” (scale); `A4` “After seeing similar answers from the AI, I would… (+1)” (single).
- **Deductive**: `B2` “I used the AI’s general explanation to figure out what I should do in my specific case.” (scale); `B4` “If the AI explained a rule that applies to all cases, I used it to… (+1)” (single).
- **Analogical**: `D2` “I thought about how the AI’s suggestions were like other tools or problems I know.” (scale); `D4` “If I didn’t understand an AI explanation, I would… (+1)” (single).
- **Reliance**: `G1` “I preferred to let the AI do most of the thinking for me.” (scale); `G4` “When given a choice… I usually… (+1)” (single).
- **Trust**: `I1` “I trusted the AI’s answers without much verification.” (scale); `I4` “When AI gave me a detailed solution, I… (+1)” (single).
- **Confidence**: `J2` “I knew how to judge when the AI’s answers were useful for my situation.” (scale); `J4` “After interacting with AI, I feel my understanding… (+1)” (single).

## Backend Score (per reflection submission)

Function: `compute_reflection_score` in `backend/app.py:477-540`.

1. Fetch the question bank and index by `id`.
2. Iterate over the submitted answers.
3. Scales (`type === "scale"`):
   - Convert the raw rating into a 0–100 score via `(value - min) / (max - min) * 100`.
   - Clamp the result to `[0, 100]`.
4. MCQs (`type === "single"` or `"multi"`):
   - Count how many selected options contain `(+1)`.
   - Score = `(positive selections ÷ total selections) * 100`.
   - Blank answers contribute `0`.
5. Aggregate:
   - `likert_mean` = average of all scale scores (or `null` when absent).
   - `mcq_mean` = average of all MCQ scores (or `null` when absent).
   - `overall` = average of those means when both exist, else whichever mean is available, else `0`.
6. Persist the rounded result alongside the answer set.

> The backend does **not** split scores by reasoning style. It only captures whole-form metrics so the dashboard can reuse the raw answers later.

## Frontend Domain Breakdown

Relevant helpers live in `src/components/ClarityDashboard.tsx:90-193`.

1. `normalizeAnswer`
   - Mirrors the backend maths to keep the results consistent.
   - Applies reverse scoring when the question text includes “reverse scored”.
2. `buildDomainSummaries`
   - Walks over every stored reflection result.
   - Buckets normalized scores by `question.domain`.
   - Tracks counts separately for Likert and MCQ responses in each domain.
   - Computes `overall`, `likert`, and `mcq` averages per reasoning style.
3. `computeScore`
   - Recomputes the per-reflection aggregates (matching the backend) so UI widgets can render without waiting for the API’s stored values.

### Positive vs. Negative Choices

- `isPositiveOption` (`ClarityDashboard.tsx:90`) treats any option containing `(+1` as a “good” selection.
- Reverse‑scored Likert questions flip the 0–100 score (`1 - normalized`) before clamping.

### Trust & Reliance Domains

- **Reliance** questions (`G1`–`G5`) measure how heavily someone leans on the AI.
  - `G3` (“I engaged deeply… (reverse scored)”) is inverted before averaging, so deeper personal engagement lowers reliance.
  - Single-choice items reward answers labelled with `(+1)`, e.g. copying the AI wholesale.
- **Trust** questions (`I1`–`I5`) track confidence in AI outputs.
  - `I2` (“I felt cautious… (reverse scored)”) penalises blind trust and boosts scores when users stay alert.
  - MCQ entries tagged `(+1)` represent unquestioning acceptance; selecting them increases trust.
- When the dashboard builds domain summaries, these adjusted Likert values and MCQ percentages roll up exactly like any other reasoning style.

## Worked Example

Consider the Analytical domain:

| Question | Type | Sample Answer | Calculation |
|----------|------|---------------|-------------|
| `C1` – “I broke down my problem into smaller parts.” | Likert (1–5) | User selects **4** | Normalized = `(4 - 1) / (5 - 1) = 0.75`, score = `75%`. |
| `C4` – “When exploring a new feature in AI, I would:” | Single-choice | User picks “Test one function at a time **(+1)**” | Positive selections = 1 of 1 → `100%`. |

- Backend (`compute_reflection_score`) records `likert_mean = 75`, `mcq_mean = 100`, and `overall = 87.5` for that reflection.
- Frontend (`buildDomainSummaries`) adds `75` to Analytical Likert scores and `100` to Analytical MCQ scores.
- The dashboard ultimately reports:
  - Analytical overall = `(75 + 100) / 2 = 87.5`.
  - Analytical likert = `75`.
  - Analytical mcq = `100`.

## Key Takeaways

- Scores flow from a single question bank; domains are defined right alongside each question.
- The backend ensures every reflection has a consistent overall/likert/mcq score.
- The frontend derives reasoning-style insights by regrouping the same normalized answers on demand.
- Positive MCQ answers must contain `(+1)` and reverse-scored Likert items flip the normalized value before use.
