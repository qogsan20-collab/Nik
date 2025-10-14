const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5050/api';

export type Question = {
  id: string;
  question: string;
  title?: string;
  options?: string[];
  type?: 'multi' | 'single' | 'scale' | 'text';
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
};

export const fetchBaselineQuestions = async (signal?: AbortSignal) => {
  const response = await fetch(`${API_BASE_URL}/baseline/questions`, { signal });
  if (!response.ok) {
    throw new Error('Failed to load baseline questions');
  }
  const data = await response.json();
  return Array.isArray(data?.questions) ? (data.questions as Question[]) : [];
};

export const submitBaselineAnswers = async (answers: Record<string, any>, userId: string) => {
  const response = await fetch(`${API_BASE_URL}/baseline/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, iterations: 0, duration: 0, user_id: userId })
  });

  if (!response.ok) {
    throw new Error('Failed to submit baseline answers');
  }

  return response.json();
};
