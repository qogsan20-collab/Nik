import React, { useEffect, useState } from 'react';
import '../styles/Reflection.css';

type Question =
  | { id: string; type: 'multi' | 'single'; domain?: string; title?: string; question: string; options: string[] }
  | { id: string; type: 'scale'; domain?: string; title?: string; question: string; scale: { min: number; max: number; minLabel?: string; maxLabel?: string } }
  | { id: string; type: 'text'; domain?: string; title?: string; question: string };

interface Props {
  taskId: string;
  taskName: string;
  taskCategory: string;
  iterations: number;
  duration: number;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5050/api';

const ReflectionModal: React.FC<Props> = ({ taskId, taskName, taskCategory, iterations, duration, userId, onClose, onSaved }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE_URL}/reflection/questions`);
      const data = await res.json();
      const all: Question[] = data.questions || [];
      // pick any 3 randomly
      const shuffled = all.sort(() => Math.random() - 0.5);
      setQuestions(shuffled.slice(0, 3));
    })();
  }, []);

  const current = questions[step];

  const next = () => {
    if (step < questions.length - 1) setStep(step + 1);
    else submit();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const submit = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reflection/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          answers,
          iterations,
          duration,
          user_id: userId,
          task_meta: {
            id: taskId,
            name: taskName,
            category: taskCategory
          }
        })
      });
      if (!response.ok) {
        throw new Error('Failed to save reflection');
      }
      setShowSaved(true);
    } catch (error) {
      console.error(error);
    }
  };

  const renderContent = () => {
    if (!current) return null;
    if (current.type === 'multi') {
      const selected: string[] = answers[current.id] || [];
      const toggle = (opt: string) => {
        const exists = selected.includes(opt);
        const updated = exists ? selected.filter(o => o !== opt) : [...selected, opt];
        setAnswers({ ...answers, [current.id]: updated });
      };
      return (
        <div className="options-list">
          {current.options.map(opt => (
            <label key={opt} className="option-item">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    }
    if (current.type === 'scale') {
      const scale = current.scale;
      const value: number = answers[current.id] ?? Math.round((scale.min + scale.max) / 2);
      return (
        <div className="scale-block">
          <div className="scale-labels">
            <span className="muted">{(scale.minLabel || 'Not at all').toUpperCase()}</span>
            <span className="muted">{(scale.maxLabel || 'Completely').toUpperCase()}</span>
          </div>
          <input
            type="range"
            min={scale.min}
            max={scale.max}
            value={value}
            onChange={e => setAnswers({ ...answers, [current.id]: Number(e.target.value) })}
            className="range"
          />
        </div>
      );
    }
    if (current.type === 'single') {
      const selected: string | undefined = answers[current.id];
      return (
        <div className="options-list">
          {current.options.map(opt => (
            <label key={opt} className="option-item">
              <input type="radio" name={current.id} checked={selected === opt} onChange={() => setAnswers({ ...answers, [current.id]: opt })} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    }
    return (
      <textarea
        className="text-area"
        placeholder="Type your reflection..."
        value={answers[current.id] || ''}
        onChange={e => setAnswers({ ...answers, [current.id]: e.target.value })}
      />
    );
  };

  return (
    <div className="overlay">
      <div className="modal-card">
        {!showSaved ? (
          <>
            <aside className="side-panel">
              <h2>Unlock<br/>adaptive<br/>intelligence</h2>
              <ul>
                <li>Human + AI synergy</li>
                <li>Clarity at speed</li>
                <li>Trackable growth</li>
                <li>Calibrated confidence</li>
              </ul>
            </aside>
            <section className="content">
              <div className="header-row">
                <h1>Qog Check</h1>
                <div className="stats"><span>{iterations} Iterations</span><span>{Math.floor(duration/60)} min {duration%60} sec</span></div>
              </div>
              {current && (
                <>
                  <h4 className="step-title">{current.title}</h4>
                  <h3 className="question-title">{current.type !== 'text' ? current.question : current.question}</h3>
                  {renderContent()}
                </>
              )}
              <div className="actions">
                <button className="btn ghost" onClick={back} disabled={step === 0}>Back</button>
                <button className="btn ghost" onClick={onClose}>Skip</button>
                <button className="btn primary" onClick={next}>{step < questions.length - 1 ? 'Next' : 'Submit'}</button>
              </div>
            </section>
          </>
        ) : (
          <div className="saved-card">
            <div className="check">✓</div>
            <h2>Reflections Saved!</h2>
            <p>You did it! Another data point, another edge. Your insights now power the <strong>Clarity Dashboard</strong>, where reflection turns into progress.</p>
            <div className="saved-actions">
              <button className="btn ghost" onClick={() => { setShowSaved(false); onClose(); }}>Close</button>
              <button className="btn primary" onClick={() => { setShowSaved(false); onSaved(); }}>My Clarity Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReflectionModal;
