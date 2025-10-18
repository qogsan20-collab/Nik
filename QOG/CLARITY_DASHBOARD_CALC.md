# Clarity Dashboard Calculations 📊

Complete documentation of how scores and metrics are calculated in the QOG Dashboard.

## Overview

The Clarity Dashboard aggregates user reflection data to provide insights into:
- **Overall Score**: Composite performance metric (0-100)
- **Domain Scores**: Performance across 8+ behavioral/cognitive domains
- **Top Reasoning Style**: Best of 3 primary reasoning domains
- **Weekly Stats**: Duration, iterations, sample count
- **Radar Chart**: Visual distribution across domains

---

## Question Types & Scoring

### 1. Likert Scale Questions (5-point)
```
1 = Strongly Disagree → Score: 0
2 = Disagree → Score: 25
3 = Neutral → Score: 50
4 = Agree → Score: 75
5 = Strongly Agree → Score: 100

Formula: (response_value - 1) * 25
```

### 2. Multiple Choice Questions
```
Option mapping: 0-100 points
"Very confident" → 100
"Somewhat confident" → 66
"Neutral" → 33
"Not confident" → 0
```

### 3. Text Response Questions
```
Current: Not automatically scored
Future: NLP-based semantic analysis
```

---

## Score Calculation

### Single Answer Scoring
```
If Likert: (value - 1) * 25
If MCQ: predefined_score
If Text: None (not counted)
```

### Reflection Score (Multiple Answers)
```
1. Score each individual answer
2. Separate into likert_scores and mcq_scores
3. Calculate means:
   - likert_mean = average(likert_scores)
   - mcq_mean = average(mcq_scores)
4. Overall = average(all_scores)

Returns: {
  'overall': overall_score,
  'likert_mean': likert_mean,
  'mcq_mean': mcq_mean,
  'likert_count': count,
  'mcq_count': count
}
```

### Example
```
User answers:
  Q1: 4 (Likert) → 75
  Q2: 5 (Likert) → 100
  Q5: "Very confident" (MCQ) → 100

Aggregation:
  likert_scores = [75, 100]
  mcq_scores = [100]
  
  likert_mean = 87.5
  mcq_mean = 100.0
  overall = (75 + 100 + 100) / 3 = 91.67
```

---

## Domain Aggregation

### 8+ Tracked Domains
```
1. Analytical - Systematic analysis
2. Critical - Critical evaluation
3. Flexibility - Adaptive thinking
4. Trust - Confidence in AI
5. Reliance - Dependence on AI
6. Confidence - Self-assurance
7. Iteration - Refinement approach
8. Optimization - Prompt engineering
```

### Computing Domain Scores
```
For each domain:
  1. Collect all question scores tagged with that domain
  2. Calculate average: domain_score = mean(scores)
  3. Track count and standard deviation
4. Sort by score (highest first)
5. Return as DomainSummary objects
```

---

## Dashboard Metrics

### Top Reasoning Style
```
Filter to 3 primary domains:
  - Analytical
  - Critical
  - Flexibility

Find maximum score among these 3
Display highest scoring domain
```

### Weekly Statistics
```
For last 7 days:
  - Count reflection submissions
  - Sum total duration (seconds)
  - Sum total iterations
  
Calculate:
  - durationSeconds: total
  - iterationsAvg: total_iterations / count
  - sampleCount: count
```

### Iterations Histogram
```
For each reflection:
  Get iterations count
  Increment bucket[iterations]

Display: [
  [1, task_count],
  [2, task_count],
  [3, task_count],
  ...
]
```

### Radar Chart
```
Filter domains to Reasoning Styles only
Sort by score (descending)
Take top 5 (usually 3 max)
Format as [{label, value}, ...]
```

---

## Key Filtering Rules

```
Top Reasoning Style:
  ✓ Only: Analytical, Critical, Flexibility
  ✗ Exclude: Trust, Reliance, Confidence

Radar Chart:
  ✓ Only: Reasoning Styles
  ✓ Top 5 domains
  ✗ Exclude: Behavioral traits

Gauge Charts:
  ✓ Trust & Reliance displayed separately
  ✓ Not part of reasoning styles
```

---

## Data Flow Example

```
User Submission:
  timestamp: 2025-10-18T10:30:00Z
  user_id: user-abc123
  answers: {Q1: 4, Q5: 100, Q7: 3}

↓ Scoring

Results Entry:
  {
    user_id: user-abc123,
    answers: {...},
    score: {
      overall: 82.5,
      likert_mean: 80,
      mcq_mean: 100,
      likert_count: 2,
      mcq_count: 1
    }
  }

↓ Aggregation

Domain Summaries:
  {domain: Trust, overall: 100, count: 8}
  {domain: Analytical, overall: 92.5, count: 15}
  ...

↓ Dashboard Rendering

Top Reasoning Style: Analytical (92.5)
Radar: [Analytical: 93, Critical: 88, Flexibility: 75]
```

---

## Performance Notes

```
Single Score: O(n) - linear in questions answered
Domain Aggregation: O(m) - linear in results
Weekly Stats: O(m) - with date filtering
All calculations: <100ms for typical user
```

---

**Last Updated**: October 18, 2025  
**Status**: ✅ Production Ready
