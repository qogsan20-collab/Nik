import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/BaselineWizard.css';
import { fetchBaselineQuestions, submitBaselineAnswers, Question } from '../services/onboarding';

type Stage = 'intro' | 'calibrating' | 'questions' | 'complete';

interface BaselineWizardProps {
  userId: string;
  onComplete: (result?: { skipped?: boolean }) => void;
}

const midpoint = (min = 1, max = 5) => Math.round((Number(min) + Number(max)) / 2);

const BaselineWizard: React.FC<BaselineWizardProps> = ({ userId, onComplete }) => {
  const [stage, setStage] = useState<Stage>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let timeout: number | undefined;
    let cancelled = false;

    const loadQuestions = async () => {
      try {
        setLoading(true);
        setError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        const abortTimeout = window.setTimeout(() => controller.abort(), 6000);

        const fetched = await fetchBaselineQuestions(controller.signal);
        window.clearTimeout(abortTimeout);

        if (cancelled) return;
        setQuestions(fetched);
        setCurrent(0);
        setAnswers({});

        timeout = window.setTimeout(() => {
          if (cancelled) return;
          setStage(fetched.length ? 'questions' : 'complete');
        }, 900);
      } catch (err: any) {
        if (!cancelled) {
          const message = err?.name === 'AbortError'
            ? 'Unable to reach the server. Check your connection and try again.'
            : err.message || 'Unable to start baseline calibration.';
          setError(message);
          setStage('intro');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (stage === 'calibrating') {
      loadQuestions();
    }

    return () => {
      abortRef.current?.abort();
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [stage]);

  const currentQuestion: Question | undefined = useMemo(() => questions[current], [questions, current]);

  const handleStart = () => {
    setStage('calibrating');
  };

  const handleSkip = async () => {
    if (stage !== 'questions') {
      onComplete({ skipped: true });
      return;
    }
    if (current < questions.length - 1) {
      setCurrent(prev => prev + 1);
      return;
    }
    await submitAndComplete();
  };

  const toggleMultiOption = (questionId: string, option: string) => {
    setAnswers(prev => {
      const selected = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = selected.includes(option);
      const updated = exists ? selected.filter((item: string) => item !== option) : [...selected, option];
      return { ...prev, [questionId]: updated };
    });
  };

  const handleSingleSelect = (questionId: string, option: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const handleTextChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleScaleChange = (questionId: string, value: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const isAnswered = (question: Question | undefined) => {
    if (!question) return false;
    const value = answers[question.id];
    const qType = question.type ?? 'multi';
    if (qType === 'multi') {
      return Array.isArray(value) && value.length > 0;
    }
    if (qType === 'single') {
      return typeof value === 'string' && value.length > 0;
    }
    if (qType === 'text') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    if (qType === 'scale') {
      return Number.isFinite(value) || value === undefined;
    }
    return false;
  };

  const goBack = () => {
    setCurrent(prev => Math.max(0, prev - 1));
  };

  const submitAndComplete = async () => {
    const compiledAnswers: Record<string, any> = { ...answers };
    questions.forEach(question => {
      if (question.type === 'scale' && compiledAnswers[question.id] === undefined) {
        const min = question.scale?.min ?? 1;
        const max = question.scale?.max ?? 5;
        compiledAnswers[question.id] = midpoint(min, max);
      }
    });

    try {
      setSubmitting(true);
      await submitBaselineAnswers(compiledAnswers, userId);
      setStage('complete');
    } catch (err: any) {
      setError(err.message || 'We hit a snag saving your baseline.');
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = async () => {
    if (!currentQuestion) return;

    if (current < questions.length - 1) {
      setCurrent(prev => prev + 1);
      return;
    }

    await submitAndComplete();
  };

  const renderQuestionContent = () => {
    if (!currentQuestion) return null;

    const qType = currentQuestion.type ?? 'multi';

    if (qType === 'multi') {
      const selected: string[] = Array.isArray(answers[currentQuestion.id]) ? answers[currentQuestion.id] : [];
      const options = currentQuestion.options ?? [];
      return (
        <div className="baseline-options">
          {options.map(option => (
            <label className="baseline-option" key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggleMultiOption(currentQuestion.id, option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    if (qType === 'single') {
      const selected = typeof answers[currentQuestion.id] === 'string' ? answers[currentQuestion.id] : '';
      const options = currentQuestion.options ?? [];
      return (
        <div className="baseline-options">
          {options.map(option => (
            <label className="baseline-option" key={option}>
              <input
                type="radio"
                name={currentQuestion.id}
                checked={selected === option}
                onChange={() => handleSingleSelect(currentQuestion.id, option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    if (qType === 'scale') {
      const min = currentQuestion.scale?.min ?? 1;
      const max = currentQuestion.scale?.max ?? 5;
      const value = Number.isFinite(answers[currentQuestion.id])
        ? Number(answers[currentQuestion.id])
        : midpoint(min, max);
      return (
        <div className="baseline-scale">
          <div className="scale-labels">
            <span>{(currentQuestion.scale?.minLabel ?? 'Not at all')}</span>
            <span>{(currentQuestion.scale?.maxLabel ?? 'Completely')}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={event => handleScaleChange(currentQuestion.id, Number(event.target.value))}
          />
          <div className="scale-value">Score: {value}</div>
        </div>
      );
    }

    return (
      <textarea
        className="baseline-textarea"
        placeholder="Share your thoughts…"
        value={answers[currentQuestion.id] ?? ''}
        onChange={event => handleTextChange(currentQuestion.id, event.target.value)}
      />
    );
  };

  return (
    <div className="baseline-overlay">
      {stage === 'intro' && (
        <div className="baseline-screen intro-screen">
          <div className="baseline-card">
            <h1>Welcome to QOG</h1>
            <p className="baseline-tagline">Your Clarity Dashboard is ready to grow with you.</p>
            <p className="baseline-subtext">Let&apos;s set a quick 2-minute baseline to unlock your first insights.</p>
            {error && <div className="baseline-error">{error}</div>}
            <div className="baseline-actions">
              <button type="button" className="ghost" onClick={handleSkip}>
                Skip for Now
              </button>
              <button type="button" className="primary" onClick={handleStart}>
                Begin Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'calibrating' && (
        <div className="baseline-screen calibrating-screen">
            <div className="baseline-card calibrating">
              <div className={`spinner ${loading ? 'spinning' : ''}`} />
              <p className="calibrating-title">Calibrating your cognitive baseline…</p>
              <p className="calibrating-sub">
                Mapping reasoning range, adaptability, and AI reliance.
              </p>
              {error && (
                <div className="baseline-error" style={{ marginTop: 16 }}>
                  {error}
                  <div className="baseline-actions single" style={{ marginTop: 12 }}>
                    <button className="ghost" type="button" onClick={() => setStage('intro')}>
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
      )}

      {stage === 'questions' && currentQuestion && (
        <div className="baseline-screen question-screen">
          <div className="question-card">
            <header className="question-header">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${((current + 1) / questions.length) * 100}%` }}
                />
              </div>
              <span className="progress-label">
                Question {current + 1} of {questions.length}
              </span>
              <button className="close-btn" type="button" onClick={handleSkip} aria-label="Close">
                ×
              </button>
            </header>
            <div className="question-body">
              <h2>{currentQuestion.question}</h2>
              <p className="question-support">
                There&apos;s no right answer, we&apos;re mapping your natural decision patterns.
              </p>
              {renderQuestionContent()}
              {error && <div className="baseline-error">{error}</div>}
            </div>
            <footer className="question-footer">
              <button type="button" className="ghost" onClick={goBack} disabled={current === 0}>
                Back
              </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleSkip}
                  disabled={submitting}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={goNext}
                  disabled={!isAnswered(currentQuestion) || submitting}
                >
                  {current === questions.length - 1 ? (submitting ? 'Saving…' : 'Submit') : 'Next'}
                </button>
            </footer>
          </div>
        </div>
      )}

      {stage === 'complete' && (
        <div className="baseline-screen complete-screen">
          <div className="baseline-card">
            <h1>Your Cognitive Baseline Is Ready</h1>
            <p className="baseline-tagline">
              Every task and reflection refines your cognitive map. The more you engage, the clearer it gets.
            </p>
            <div className="baseline-actions single">
              <button type="button" className="primary" onClick={() => onComplete()}>
                Start My First Reflection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BaselineWizard;
