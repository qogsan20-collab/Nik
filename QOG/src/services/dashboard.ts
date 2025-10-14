const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5050/api';

export interface DashboardRecord {
  timestamp: string;
  task_id?: string | null;
  answers: Record<string, any>;
  iterations?: number | null;
  duration?: number | null;
  score?: {
    overall: number;
    likert_mean: number | null;
    mcq_mean: number | null;
    likert_count: number;
    mcq_count: number;
  } | null;
  context?: 'baseline' | 'reflection';
  task_meta?: {
    id?: string;
    name?: string;
    category?: string;
  };
}

export interface DashboardQuestion {
  id: string;
  type: 'scale' | 'single' | 'multi' | 'text';
  domain?: string;
  question: string;
  scale?: { min?: number; max?: number; minLabel?: string; maxLabel?: string };
  options?: string[];
}

export interface PromptHack {
  id: string;
  domain: string;
  title: string;
  tip: string;
  example?: string;
}

export interface DashboardSource {
  records: DashboardRecord[];
  questions: DashboardQuestion[];
  promptHacks: PromptHack[];
}

const safeJson = async <T>(response: Response): Promise<T> => {
  const data = await response.json();
  return data as T;
};

export const fetchDashboardSource = async (userId: string): Promise<DashboardSource> => {
  const resultsUrl = `${API_BASE_URL}/reflection/results?user_id=${encodeURIComponent(userId)}`;
  const [resultsRes, questionsRes, hacksRes] = await Promise.all([
    fetch(resultsUrl),
    fetch(`${API_BASE_URL}/reflection/questions`),
    fetch(`${API_BASE_URL}/prompt-hacks`)
  ]);

  if (!resultsRes.ok) {
    throw new Error('Failed to load reflection results');
  }
  if (!questionsRes.ok) {
    throw new Error('Failed to load reflection questions');
  }
  if (!hacksRes.ok) {
    throw new Error('Failed to load prompt hacks');
  }

  const [results, questionsPayload, hacksPayload] = await Promise.all([
    safeJson<DashboardRecord[]>(resultsRes),
    safeJson<{ questions?: DashboardQuestion[] }>(questionsRes),
    safeJson<{ hacks?: PromptHack[] }>(hacksRes)
  ]);

  return {
    records: Array.isArray(results) ? results : [],
    questions: Array.isArray(questionsPayload?.questions) ? questionsPayload.questions : [],
    promptHacks: Array.isArray(hacksPayload?.hacks) ? hacksPayload.hacks : []
  };
};
