import React, { useEffect, useMemo, useState } from 'react';
import '../styles/Dashboard.css';
import { fetchDashboardSource, DashboardRecord, DashboardQuestion, PromptHack } from '../services/dashboard';

type ScoreBreakdown = {
  overall: number;
  likert_mean: number | null;
  mcq_mean: number | null;
  likert_count: number;
  mcq_count: number;
};

type DomainSummary = {
  domain: string;
  overall: number;
  likert: number | null;
  mcq: number | null;
  responses: number;
};

type RadarDatum = {
  label: string;
  value: number;
};

type WeekStats = {
  currentAvg: number;
  previousAvg: number;
  delta: number;
  durationSeconds: number;
  iterationsAvg: number;
  sampleCount: number;
};

type HistogramBucket = [number, number];

const excludedDomains = new Set<string>(['Analogical']);

const friendlyName: Record<string, string> = {
  Analytical: 'Analytical',
  Critical: 'Critical Thinking',
  Flexibility: 'Cognitive Flexibility',
  Inductive: 'Inductive Reasoning',
  Deductive: 'Deductive Logic',
  Reliance: 'Reliance',
  Trust: 'Trust',
  Confidence: 'Confidence'
};

const reasoningDisplayOrder: string[] = ['Analytical', 'Critical', 'Flexibility'];

const domainNarratives: Record<string, { strength: string; stretch: string }> = {
  Analytical: {
    strength: 'You excel at structuring complex prompts into actionable steps.',
    stretch: 'Break larger problems into checkpoints to sharpen analytical follow-through.'
  },
  Critical: {
    strength: 'You consistently evaluate AI output with healthy scepticism.',
    stretch: 'Add quick evidence checks to keep building that critical edge.'
  },
  Flexibility: {
    strength: 'You adapt quickly when the AI shifts direction or tone.',
    stretch: 'Experiment with alternative perspectives before locking in a solution.'
  },
  Inductive: {
    strength: 'You spot emerging patterns in AI suggestions with ease.',
    stretch: 'Capture recurring cues to turn intuition into reusable playbooks.'
  },
  Deductive: {
    strength: 'You apply high-level rules precisely to your own context.',
    stretch: 'Document a quick checklist to make each deduction even sharper.'
  },
  Reliance: {
    strength: 'You know when to lean on the AI to speed through execution.',
    stretch: 'Pair AI drafts with a quick sense-check to keep ownership tight.'
  },
  Trust: {
    strength: 'You operate with balanced confidence in the AI’s responses.',
    stretch: 'Introduce lightweight validation loops to sustain informed trust.'
  },
  Confidence: {
    strength: 'You guide collaborations with AI from a place of informed clarity.',
    stretch: 'Share quick summaries of how you evaluate AI to reinforce confidence.'
  }
};

const isPositiveOption = (opt: string) => typeof opt === 'string' && opt.includes('(+1');

const isReverseScored = (question: DashboardQuestion) => {
  const text = `${question.title ?? ''} ${question.question ?? ''}`.toLowerCase();
  return text.includes('reverse scored');
};

const normalizeAnswer = (answer: any, question: DashboardQuestion): { score: number; kind: 'likert' | 'mcq' } | null => {
  if (!question) return null;
  if (question.type === 'scale') {
    const min = Number(question.scale?.min ?? 1);
    const max = Number(question.scale?.max ?? 5);
    const value = Number(answer);
    if (!Number.isFinite(value) || max <= min) return null;
    const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const adjusted = isReverseScored(question) ? 1 - normalized : normalized;
    return { score: Math.min(1, Math.max(0, adjusted)) * 100, kind: 'likert' };
  }

  if (question.type === 'single' || question.type === 'multi') {
    const selected = question.type === 'single'
      ? (typeof answer === 'string' ? [answer] : [])
      : (Array.isArray(answer) ? answer : []);

    if (!selected.length) {
      return { score: 0, kind: 'mcq' };
    }

    const positives = selected.filter(item => isPositiveOption(item));
    const pct = (positives.length / selected.length) * 100;
    return { score: pct, kind: 'mcq' };
  }

  return null;
};

const computeScore = (answers: Record<string, any>, questionMap: Record<string, DashboardQuestion>): ScoreBreakdown => {
  const likert: number[] = [];
  const mcq: number[] = [];

  Object.entries(answers || {}).forEach(([qid, value]) => {
    const question = questionMap[qid];
    const normalized = question ? normalizeAnswer(value, question) : null;
    if (!normalized) return;
    if (normalized.kind === 'likert') likert.push(normalized.score);
    else mcq.push(normalized.score);
  });

  const avg = (list: number[]) => list.reduce((acc, val) => acc + val, 0) / list.length;

  const likert_mean = likert.length ? avg(likert) : null;
  const mcq_mean = mcq.length ? avg(mcq) : null;
  const overall =
    likert_mean !== null && mcq_mean !== null
      ? (likert_mean + mcq_mean) / 2
      : likert_mean ?? mcq_mean ?? 0;

  return {
    overall: Math.round(overall * 100) / 100,
    likert_mean: likert_mean !== null ? Math.round(likert_mean * 100) / 100 : null,
    mcq_mean: mcq_mean !== null ? Math.round(mcq_mean * 100) / 100 : null,
    likert_count: likert.length,
    mcq_count: mcq.length
  };
};

const buildDomainSummaries = (records: DashboardRecord[], questionMap: Record<string, DashboardQuestion>): DomainSummary[] => {
  const domainMap = new Map<string, { likert: number[]; mcq: number[]; responses: number }>();

  records.forEach(record => {
    Object.entries(record.answers || {}).forEach(([qid, value]) => {
      const question = questionMap[qid];
      if (!question?.domain) return;
      if (excludedDomains.has(question.domain)) return;

      const normalized = normalizeAnswer(value, question);
      if (!normalized) return;

      const entry = domainMap.get(question.domain) ?? { likert: [], mcq: [], responses: 0 };
      if (normalized.kind === 'likert') entry.likert.push(normalized.score);
      else entry.mcq.push(normalized.score);
      entry.responses += 1;
      domainMap.set(question.domain, entry);
    });
  });

  const avg = (list: number[]) => list.reduce((acc, val) => acc + val, 0) / list.length;

  return Array.from(domainMap.entries()).map(([domain, entry]) => {
    const likertAvg = entry.likert.length ? avg(entry.likert) : null;
    const mcqAvg = entry.mcq.length ? avg(entry.mcq) : null;
    const overall =
      likertAvg !== null && mcqAvg !== null
        ? (likertAvg + mcqAvg) / 2
        : likertAvg ?? mcqAvg ?? 0;

    return {
      domain,
      overall,
      likert: likertAvg,
      mcq: mcqAvg,
      responses: entry.responses
    };
  });
};

const buildDomainMap = (summaries: DomainSummary[]) => {
  const map = new Map<string, DomainSummary>();
  summaries.forEach(summary => map.set(summary.domain, summary));
  return map;
};

const formatPercent = (value?: number | null, precision = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(precision)}%`;
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '0 m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs) return `${hrs} hr ${mins} m`;
  if (mins) return `${mins} min`;
  return `${secs}s`;
};

const formatDurationDetailed = (seconds: number) => {
  if (!seconds) return '0 m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs && mins) return `${hrs} hr ${mins} m`;
  if (hrs) return `${hrs} hr`;
  return `${mins} m`;
};

const formatDateShort = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatDelta = (delta: number) => {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return '0.0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
};

const computeWeekStats = (records: DashboardRecord[]): WeekStats => {
  const reflections = records.filter(record => record.context !== 'baseline');
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const startCurrent = now - weekMs;
  const startPrevious = now - weekMs * 2;

  const toMs = (record: DashboardRecord) => new Date(record.timestamp).getTime();

  const current = reflections.filter(record => toMs(record) >= startCurrent);
  const previous = reflections.filter(record => {
    const ts = toMs(record);
    return ts >= startPrevious && ts < startCurrent;
  });

  const averageOverall = (items: DashboardRecord[]) => {
    const valid = items.filter(item => typeof item.score?.overall === 'number');
    if (!valid.length) return 0;
    const total = valid.reduce((sum, item) => sum + (item.score?.overall ?? 0), 0);
    return total / valid.length;
  };

  const durationSeconds = current.reduce((sum, item) => sum + (item.duration ?? 0), 0);
  const iterationsAvg = current.length
    ? current.reduce((sum, item) => sum + (item.iterations ?? 0), 0) / current.length
    : 0;

  return {
    currentAvg: averageOverall(current),
    previousAvg: averageOverall(previous),
    delta: averageOverall(current) - averageOverall(previous),
    durationSeconds,
    iterationsAvg,
    sampleCount: current.length
  };
};

const buildHistogram = (records: DashboardRecord[]): HistogramBucket[] => {
  const bucketMap = new Map<number, number>();
  records.forEach(record => {
    const iter = record.iterations ?? 0;
    bucketMap.set(iter, (bucketMap.get(iter) ?? 0) + 1);
  });
  return Array.from(bucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, 6);
};

const selectPromptHack = (summaries: DomainSummary[], hacks: PromptHack[]) => {
  if (!summaries.length || !hacks.length) return null;
  const weakest = summaries.reduce<DomainSummary | null>((worst, current) => {
    if (!worst) return current;
    return current.overall < worst.overall ? current : worst;
  }, null);
  if (!weakest) return hacks[0];
  return hacks.find(hack => hack.domain === weakest.domain) ?? hacks[0];
};

const getGaugeZone = (value: number) => {
  if (!Number.isFinite(value)) return { label: 'No data yet', tone: 'neutral' as const };
  if (value >= 80) return { label: 'High zone', tone: 'high' as const };
  if (value >= 60) return { label: 'Balanced zone', tone: 'balanced' as const };
  if (value >= 40) return { label: 'Moderate zone', tone: 'moderate' as const };
  return { label: 'Low zone', tone: 'low' as const };
};

const SemiGauge: React.FC<{ value: number }> = ({ value }) => {
  const safeValue = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const dashOffset = 100 - safeValue;
  const pointerAngleDeg = 180 - safeValue * 1.8;
  const pointerRadians = (Math.PI / 180) * pointerAngleDeg;
  const pointerLength = 38;
  const centerX = 60;
  const centerY = 60;
  const pointerX = centerX + pointerLength * Math.cos(pointerRadians);
  const pointerY = centerY - pointerLength * Math.sin(pointerRadians);

  return (
    <svg className="semi-gauge" viewBox="0 0 120 70">
      <path d="M20 60 A40 40 0 0 1 100 60" className="semi-gauge-track" pathLength={100} />
      <path
        d="M20 60 A40 40 0 0 1 100 60"
        className="semi-gauge-progress"
        strokeDasharray="100"
        strokeDashoffset={dashOffset}
        pathLength={100}
      />
      <line x1={centerX} y1={centerY} x2={pointerX} y2={pointerY} className="semi-gauge-needle" />
      <circle cx={centerX} cy={centerY} r="4" className="semi-gauge-hub" />
    </svg>
  );
};

interface GaugeStatCardProps {
  title: string;
  subtitle: string;
  value?: number;
}

const GaugeStatCard: React.FC<GaugeStatCardProps> = ({ title, subtitle, value }) => {
  const hasValue = value !== undefined && value !== null && Number.isFinite(value);
  const safeValue = hasValue ? Number(value) : 0;
  const zone = getGaugeZone(hasValue ? safeValue : Number.NaN);
  return (
    <article className="score-card gauge-card">
      <div className="card-title">{title}</div>
      <p className="card-note">{subtitle}</p>
      <SemiGauge value={safeValue} />
      <p className="gauge-value">{hasValue ? formatPercent(safeValue, 0) : '—'}</p>
      <span className={`gauge-zone ${zone.tone}`}>{zone.label}</span>
    </article>
  );
};

const RadarProfile: React.FC<{ data: RadarDatum[] }> = ({ data }) => {
  if (!data.length) {
    return (
      <div className="radar-empty">
        Complete reflections to unlock your reasoning profile.
      </div>
    );
  }

  const center = 160;
  const maxRadius = 140;
  const levels = [0.25, 0.5, 0.75, 1];

  const points = data
    .map((item, index) => {
      const angle = (Math.PI * 2 * index) / data.length - Math.PI / 2;
      const radius = (item.value / 100) * maxRadius;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(' ');

  const axes = data.map((_, index) => {
    const angle = (Math.PI * 2 * index) / data.length - Math.PI / 2;
    const x = center + maxRadius * Math.cos(angle);
    const y = center + maxRadius * Math.sin(angle);
    return { x, y };
  });

  return (
    <div className="radar-wrapper">
      <svg className="radar-svg" viewBox="0 0 320 320">
        {levels.map(level => {
          const labelYOffset = level === 1 ? -10 : 12;
          return (
            <React.Fragment key={level}>
            <circle
              cx={center}
              cy={center}
              r={maxRadius * level}
              className={`radar-circle${level === 1 ? ' outer' : ''}`}
            />
            <text
              x={center}
              y={center - maxRadius * level + labelYOffset}
              className="radar-level-label"
            >
              {(level * 100).toFixed(0)}
            </text>
            </React.Fragment>
          );
        })}
        {axes.map((axis, index) => (
          <line key={index} x1={center} y1={center} x2={axis.x} y2={axis.y} className="radar-axis" />
        ))}
        <polygon points={points} className="radar-polygon" />
      </svg>
      <ul className="radar-legend">
        {data.map(item => (
          <li key={item.label}>
            <span>{item.label}</span>
            <span>{item.value.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface Props {
  onBack?: () => void;
  refreshKey?: number;
  userDisplayName?: string;
  userId: string;
}

const ClarityDashboard: React.FC<Props> = ({ onBack, refreshKey, userDisplayName, userId }) => {
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [questions, setQuestions] = useState<DashboardQuestion[]>([]);
  const [promptHacks, setPromptHacks] = useState<PromptHack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        const source = await fetchDashboardSource(userId);
        if (ignore) return;
        setRecords(Array.isArray(source.records) ? source.records : []);
        setQuestions(Array.isArray(source.questions) ? source.questions : []);
        const hacks = Array.isArray(source.promptHacks)
          ? source.promptHacks.filter(hack => !excludedDomains.has(hack.domain))
          : [];
        setPromptHacks(hacks);
        setError(null);
      } catch (err: any) {
        if (!ignore) setError(err.message || 'Something went wrong while loading your insights.');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [refreshKey, userId]);

  const questionMap = useMemo(() => {
    return questions.reduce<Record<string, DashboardQuestion>>((acc, question) => {
      acc[question.id] = question;
      return acc;
    }, {});
  }, [questions]);

  const enrichedRecords = useMemo(() => {
    return records.map(record => {
      const ensuredScore = record.score ?? computeScore(record.answers, questionMap);
      return { ...record, score: ensuredScore };
    });
  }, [records, questionMap]);

  const sortedRecords = useMemo(() => {
    return [...enrichedRecords].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [enrichedRecords]);

  const reflectionRecords = useMemo(() => {
    return sortedRecords.filter(record => record.context !== 'baseline');
  }, [sortedRecords]);

  const domainSummaries = useMemo(
    () => buildDomainSummaries(enrichedRecords, questionMap),
    [enrichedRecords, questionMap]
  );

  const domainMap = useMemo(() => buildDomainMap(domainSummaries), [domainSummaries]);

  const hasData = sortedRecords.length > 0;

  const topDomain = useMemo(() => {
    if (!domainSummaries.length) return null;
    return domainSummaries.reduce((best, current) =>
      current.overall > (best?.overall ?? -Infinity) ? current : best
    , domainSummaries[0]);
  }, [domainSummaries]);

  const overallAverage = useMemo(() => {
    if (!hasData) return 0;
    const total = sortedRecords.reduce((acc, item) => acc + (item.score?.overall ?? 0), 0);
    return total / sortedRecords.length;
  }, [sortedRecords, hasData]);

  const weekStats = useMemo(() => computeWeekStats(enrichedRecords), [enrichedRecords]);

  const histogramBuckets = useMemo(
    () => buildHistogram(reflectionRecords),
    [reflectionRecords]
  );

  const overallIterationsAverage = useMemo(() => {
    if (!reflectionRecords.length) return 0;
    const total = reflectionRecords.reduce((sum, item) => sum + (item.iterations ?? 0), 0);
    return total / reflectionRecords.length;
  }, [reflectionRecords]);

  const reasoningSummaries = useMemo(
    () =>
      reasoningDisplayOrder.map(domain => ({
        domain,
        summary: domainSummaries.find(entry => entry.domain === domain) ?? null
      })),
    [domainSummaries]
  );

  const highlightSummary = topDomain ?? reasoningSummaries.find(item => item.summary)?.summary ?? null;
  const highlightDomainKey = highlightSummary?.domain ?? reasoningSummaries[0]?.domain ?? 'Analytical';
  const highlightLabel = friendlyName[highlightDomainKey] ?? highlightDomainKey;
  const secondaryReasoningSummaries = reasoningSummaries.filter(({ domain, summary }) => {
    const domainKey = summary?.domain ?? domain;
    return domainKey !== highlightDomainKey;
  });

  const radarData = useMemo<RadarDatum[]>(() => {
    if (!domainSummaries.length) return [];
    return [...domainSummaries]
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 5)
      .map(summary => ({
        label: friendlyName[summary.domain] ?? summary.domain,
        value: Math.round(summary.overall)
      }));
  }, [domainSummaries]);

  const weakestDomain = useMemo(() => {
    if (!domainSummaries.length) return null;
    return domainSummaries.reduce((worst, current) =>
      current.overall < (worst?.overall ?? Infinity) ? current : worst
    , domainSummaries[0]);
  }, [domainSummaries]);

  const promptHack = useMemo(
    () => selectPromptHack(domainSummaries, promptHacks),
    [domainSummaries, promptHacks]
  );

  const strengthInsight = useMemo(() => {
    if (!topDomain) return null;
    const narrative = domainNarratives[topDomain.domain] || {
      strength: `You show consistent progress in ${friendlyName[topDomain.domain] ?? topDomain.domain}.`,
      stretch: `Keep exploring new scenarios to reinforce your ${friendlyName[topDomain.domain] ?? topDomain.domain} instincts.`
    };
    return { domain: topDomain.domain, ...narrative };
  }, [topDomain]);

  const growthInsight = useMemo(() => {
    if (!weakestDomain) return null;
    const narrative = domainNarratives[weakestDomain.domain] || {
      strength: `You are developing a baseline in ${friendlyName[weakestDomain.domain] ?? weakestDomain.domain}.`,
      stretch: `Capture one takeaway after each session to strengthen ${friendlyName[weakestDomain.domain] ?? weakestDomain.domain} habits.`
    };
    return { domain: weakestDomain.domain, message: narrative.stretch };
  }, [weakestDomain]);

  const engagementInsight = useMemo(() => {
    if (!weekStats.sampleCount) {
      return 'Complete a few reflections this week to unlock cadence insights.';
    }
    if (weekStats.iterationsAvg >= 3) {
      return 'Your iteration cadence shows thoughtful refinement before closing tasks.';
    }
    return 'Layer in one more iteration per task this week to deepen your AI-assisted thinking.';
  }, [weekStats]);

  const deltaTone =
    !Number.isFinite(weekStats.delta) || Math.abs(weekStats.delta) < 0.05
      ? 'neutral'
      : weekStats.delta > 0
        ? 'positive'
        : 'negative';

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <p className="headline-sub">Clarity Dashboard</p>
          <h1>Hey {userDisplayName ?? 'there'}, ready to grow?</h1>
          <p className="headline-description">Your cognition trends update in real time.</p>
        </div>
        <div className="hero-actions">
          <div className="today-pill">
            <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          <button className="primary-action" disabled>
            My Reflections
          </button>
          {onBack && (
            <button className="ghost-action" onClick={onBack}>
              Back to chat
            </button>
          )}
        </div>
      </header>

      {loading && (
        <div className="empty-state">Loading your insights…</div>
      )}

      {!loading && error && (
        <div className="empty-state error">{error}</div>
      )}

      {!loading && !error && !hasData && (
        <div className="empty-state">
          Complete your first reflection to unlock the Clarity Dashboard.
        </div>
      )}

      {!loading && !error && hasData && (
        <>
          <section className="score-grid">
            <article className="score-card highlight">
              <div className="card-tag">Top Reasoning Style</div>
              <h2>{highlightLabel}</h2>
              <p className="score-value">{formatPercent(highlightSummary?.overall, 0)}</p>
              <span className={`delta-pill ${deltaTone}`}>
                {formatDelta(weekStats.delta)} pts vs last week
              </span>
              <p className="card-note">Average score across {sortedRecords.length} sessions: {formatPercent(overallAverage, 0)}</p>
              <button className="link-button" type="button">View all reasoning scores</button>
            </article>

            {secondaryReasoningSummaries.map(({ domain, summary }) => {
              const domainKey = summary?.domain ?? domain;
              const label = friendlyName[domainKey] ?? domainKey;
              const note = summary
                ? domainNarratives[domainKey]?.strength ?? `Growing confidence in ${label}.`
                : 'Complete a few reflections to unlock this insight.';

              return (
                <article key={domain} className="score-card domain-card">
                  <div className="card-title">{label}</div>
                  <p className="score-value small">{formatPercent(summary?.overall, 0)}</p>
                  <p className="card-note">{note}</p>
                </article>
              );
            })}

            <article className="score-card metric-card">
              <div className="card-title">Time spent with QOG</div>
              <p className="time-value">{formatDurationDetailed(weekStats.durationSeconds)}</p>
              <p className="card-note">This week ({weekStats.sampleCount} reflections)</p>
            </article>

            <article className="score-card metric-card">
              <div className="card-title">Average iterations per task</div>
              <p className="score-value small">{weekStats.iterationsAvg.toFixed(1)}</p>
              <p className="card-note">Refinements before reaching completion</p>
            </article>
          </section>

          <section className="visual-grid">
            <GaugeStatCard
              title="Reliance"
              subtitle="How often you depend on QOG"
              value={domainMap.get('Reliance')?.overall}
            />
            <GaugeStatCard
              title="Trust"
              subtitle="Confidence in AI-generated solutions"
              value={domainMap.get('Trust')?.overall}
            />

            <article className="score-card histogram-card">
              <div className="card-title">Histogram</div>
              <p className="card-note">Task count vs iterations</p>
              <div className="histogram">
                {histogramBuckets.length ? (
                  histogramBuckets.map(([iter, count]) => {
                    const denominator = reflectionRecords.length || 1;
                    const width = Math.max(18, Math.min(100, (count / denominator) * 100));
                    return (
                      <div key={iter} className="histogram-row">
                        <span className="histogram-label">{iter}</span>
                        <div className="histogram-bar" style={{ width: `${width}%` }}>
                          <span className="histogram-count">{count}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="card-note">Iteration data will appear once reflections are logged.</p>
                )}
              </div>
              <p className="card-note">
                Average iterations: {overallIterationsAverage ? overallIterationsAverage.toFixed(1) : '—'}
              </p>
            </article>

            <article className="score-card radar-card">
              <div className="card-title">Your Reasoning Profile</div>
              <p className="card-note">Compare strengths across reasoning types.</p>
              <RadarProfile data={radarData} />
            </article>

            <article className="score-card prompt-card">
              <div className="card-title">Prompt Hack of the Day</div>
              {promptHack ? (
                <>
                  <p className="prompt-domain">
                    Focus: {friendlyName[promptHack.domain] ?? promptHack.domain}
                  </p>
                  <h4>{promptHack.title}</h4>
                  <p className="prompt-tip">{promptHack.tip}</p>
                  {promptHack.example && (
                    <p className="prompt-example">
                      <strong>Example:</strong> {promptHack.example}
                    </p>
                  )}
                </>
              ) : (
                <p className="card-note">Complete more reflections to unlock a tailored prompt hack.</p>
              )}
            </article>
          </section>

          <section className="insights">
            <h3>Key Insights</h3>
            <div className="insight-list">
              {strengthInsight && (
                <article className="insight-card strength">
                  <div className="insight-card-header">
                    <span className="insight-label">Strength</span>
                    <h4>{friendlyName[strengthInsight.domain] ?? strengthInsight.domain}</h4>
                  </div>
                  <p>{strengthInsight.strength}</p>
                </article>
              )}

              {growthInsight && (
                <article className="insight-card watch">
                  <div className="insight-card-header">
                    <span className="insight-label">Growth Focus</span>
                    <h4>{friendlyName[growthInsight.domain] ?? growthInsight.domain}</h4>
                  </div>
                  <p>{growthInsight.message}</p>
                </article>
              )}

              {engagementInsight && (
                <article className="insight-card neutral">
                  <div className="insight-card-header">
                    <span className="insight-label">Workflow Rhythm</span>
                    <h4>Reflections cadence</h4>
                  </div>
                  <p>{engagementInsight}</p>
                </article>
              )}
            </div>
          </section>

          <section className="history">
            <h3>Reflection History</h3>
            <div className="history-table">
              <div className="history-header">
                <span>Date</span>
                <span>Task</span>
                <span>Category</span>
                <span>Score</span>
                <span>Iterations</span>
                <span>Time</span>
              </div>
              {sortedRecords.map(entry => (
                <div key={entry.timestamp} className="history-row">
                  <span>{formatDateShort(entry.timestamp)}</span>
                  <span>
                    {entry.context === 'baseline'
                      ? 'Baseline Onboarding'
                      : entry.task_meta?.name || entry.task_id || 'Untitled task'}
                  </span>
                  <span>
                    {entry.context === 'baseline'
                      ? '—'
                      : entry.task_meta?.category || 'General'}
                  </span>
                  <span>{formatPercent(entry.score?.overall, 0)}</span>
                  <span>
                    {entry.context === 'baseline'
                      ? '—'
                      : entry.iterations ?? '—'}
                  </span>
                  <span>
                    {entry.context === 'baseline'
                      ? '—'
                      : formatDuration(entry.duration ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ClarityDashboard;
