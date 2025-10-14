import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ClarityDashboard from './components/ClarityDashboard';
import BaselineWizard from './components/BaselineWizard';
import LoginForm from './components/auth/LoginForm';
import SignupForm from './components/auth/SignupForm';
import './styles/App.css';
import './styles/Auth.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

interface TaskSummary {
  id: string;
  task_id?: string;
  user_id?: string;
  name: string;
  category: string;
  iterations: number;
  duration: number;
  last_activity?: string | null;
  is_active?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
}

type ActiveTask = TaskSummary & { messages: Message[] };

interface AuthUser {
  id: string;
  name: string;
  email: string;
  created_at?: string;
  updated_at?: string;
}

type ViewMode = 'chat' | 'dashboard';
type AuthView = 'login' | 'signup';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5050/api';
const AUTH_STORAGE_KEY = 'qog.auth.user';

const lastActivityFromPayload = (payload: any): string | null => {
  const lastMessageTs = Array.isArray(payload?.messages) && payload.messages.length
    ? payload.messages[payload.messages.length - 1]?.timestamp ?? null
    : null;
  return payload?.last_activity
    ?? payload?.updated_at
    ?? payload?.completed_at
    ?? payload?.started_at
    ?? lastMessageTs
    ?? null;
};

const normalizeTaskSummary = (payload: any): TaskSummary => {
  const resolvedId = String(payload?.id ?? payload?.task_id ?? `task-${Date.now()}`);
  const lastActivity = lastActivityFromPayload(payload);
  return {
    id: resolvedId,
    task_id: payload?.task_id ?? resolvedId,
    user_id: payload?.user_id,
    name: payload?.name ?? 'Untitled Task',
    category: payload?.category ?? 'General',
    iterations: Number(payload?.iterations ?? 0),
    duration: Number(payload?.duration ?? 0),
    last_activity: typeof lastActivity === 'string' ? lastActivity : null,
    is_active: typeof payload?.is_active === 'boolean' ? payload.is_active : undefined,
    started_at: typeof payload?.started_at === 'string' ? payload.started_at : null,
    completed_at: typeof payload?.completed_at === 'string' ? payload.completed_at : null
  };
};

const normalizeActiveTask = (payload: any): ActiveTask => {
  const summary = normalizeTaskSummary(payload);
  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages: Message[] = rawMessages.map((message: any, index: number) => ({
    id: String(message?.id ?? `msg-${summary.id}-${index}`),
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: String(message?.content ?? ''),
    timestamp: String(message?.timestamp ?? new Date().toISOString()),
    metadata: message?.metadata ?? null
  }));
  return {
    ...summary,
    messages
  };
};

const loadStoredUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.email) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const persistUser = (user: AuthUser | null) => {
  if (typeof window === 'undefined') return;
  if (user) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
};

const toTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortTaskSummaries = (items: TaskSummary[]): TaskSummary[] => {
  return [...items].sort((a, b) => toTimestamp(b.last_activity) - toTimestamp(a.last_activity));
};

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());
  const [authView, setAuthView] = useState<AuthView>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [currentTask, setCurrentTask] = useState<ActiveTask | null>(null);
  const [previousTasks, setPreviousTasks] = useState<TaskSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('chat');
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);
  const [hasHydratedHistory, setHasHydratedHistory] = useState(false);

  const [onboardingStatus, setOnboardingStatus] = useState<{ completed: boolean; completedAt?: string | null } | null>(null);
  const [showBaselineWizard, setShowBaselineWizard] = useState(false);

  const userDisplayName = useMemo(() => {
    if (!user?.name) return null;
    const [first] = user.name.split(' ');
    return first || user.name;
  }, [user?.name]);

  useEffect(() => {
    if (!user) {
      setCurrentTask(null);
      setPreviousTasks([]);
      setOnboardingStatus(null);
      setShowBaselineWizard(false);
      setActiveView('chat');
      return;
    }

    const controller = new AbortController();

    const fetchInitialData = async () => {
      await Promise.allSettled([
        fetchOnboardingStatus(user.id, controller.signal),
        (async () => {
          const tasks = await fetchPreviousTasks(user.id, { signal: controller.signal });
          if (!hasHydratedHistory && tasks.length) {
            // Remember that we've already hydrated the task list without auto-selecting a task.
            setHasHydratedHistory(true);
          }
        })()
      ]);
    };

    fetchInitialData();

    return () => {
      controller.abort();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (onboardingStatus === null) return;
    setShowBaselineWizard(!onboardingStatus.completed);
  }, [user, onboardingStatus]);

  const fetchOnboardingStatus = async (userId: string, signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/onboarding/status?user_id=${encodeURIComponent(userId)}`, { signal });
      if (!response.ok) {
        throw new Error('Unable to load onboarding status');
      }
      const data = await response.json();
      setOnboardingStatus({
        completed: Boolean(data?.completed),
        completedAt: data?.completed_at ?? data?.completedAt ?? null
      });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return;
      console.warn('Failed to load onboarding status', error);
      setOnboardingStatus({ completed: false });
    }
  };

  const fetchPreviousTasks = async (userId: string, options?: { signal?: AbortSignal }) => {
    const signal = options?.signal;
    try {
      const response = await fetch(`${API_BASE_URL}/get-all-tasks?user_id=${encodeURIComponent(userId)}`, { signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const normalized = sortTaskSummaries(data.map(normalizeTaskSummary));
        setPreviousTasks(normalized);
        return normalized;
      } else {
        setPreviousTasks([]);
        return [];
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return [];
      console.error('Failed to fetch previous tasks:', error);
      setPreviousTasks([]);
      return [];
    }
  };

  const handleLogin = async ({ email, password }: { email: string; password: string }) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to sign in. Double-check your credentials.');
      }

      const authUser: AuthUser | null = payload?.user ?? null;
      if (!authUser) {
        throw new Error('Missing user payload.');
      }

      setUser(authUser);
      persistUser(authUser);
      setActiveView('chat');
      setCurrentTask(null);
      setHasHydratedHistory(false);

      const onboarding = payload?.onboarding ?? {};
      setOnboardingStatus({
        completed: Boolean(onboarding.completed),
        completedAt: onboarding.completed_at ?? onboarding.completedAt ?? null
      });
      setShowBaselineWizard(!onboarding?.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async ({ name, email, password }: { name: string; email: string; password: string }) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create account.');
      }

      const authUser: AuthUser | null = payload?.user ?? null;
      if (!authUser) {
        throw new Error('Missing user payload.');
      }

      setUser(authUser);
      persistUser(authUser);
      setActiveView('chat');
      setCurrentTask(null);
      setHasHydratedHistory(false);

      const onboarding = payload?.onboarding ?? {};
      setOnboardingStatus({
        completed: Boolean(onboarding.completed),
        completedAt: onboarding.completed_at ?? onboarding.completedAt ?? null
      });
      setShowBaselineWizard(!onboarding?.completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account.';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    persistUser(null);
    setAuthView('login');
    setAuthError(null);
    setCurrentTask(null);
    setPreviousTasks([]);
    setOnboardingStatus(null);
    setShowBaselineWizard(false);
    setInsightsRefreshKey(0);
    setHasHydratedHistory(false);
  };

  const triggerInsightsRefresh = () => {
    setInsightsRefreshKey((prev) => prev + 1);
  };

  const handleBaselineCompleted = (result?: { skipped?: boolean }) => {
    if (result?.skipped) {
      setShowBaselineWizard(false);
      return;
    }

    setOnboardingStatus({ completed: true, completedAt: new Date().toISOString() });
    setShowBaselineWizard(false);
    triggerInsightsRefresh();
  };

  const upsertTaskSummary = (taskPayload: any) => {
    const summary = normalizeTaskSummary(taskPayload);
    setPreviousTasks(prev => {
      const filtered = prev.filter(item => item.id !== summary.id);
      return sortTaskSummaries([summary, ...filtered]);
    });
  };

  const handleNewTask = async (taskName = 'New Task', category = 'General') => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/new-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName,
          category,
          user_id: user.id
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create task: ${response.status}`);
      }

      const payload = await response.json();
      const normalized = normalizeActiveTask(payload);
      setCurrentTask(normalized);
      setActiveView('chat');
      setHasHydratedHistory(true);
      upsertTaskSummary(payload);
      await fetchPreviousTasks(user.id);
    } catch (error) {
      console.error('Failed to create new task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!currentTask || !user || !message.trim()) return;

    const userMessage: Message = {
      id: `msg-local-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      metadata: { kind: 'user_input' }
    };

    const optimisticTask: ActiveTask = {
      ...currentTask,
      messages: [...currentTask.messages, userMessage],
      iterations: currentTask.iterations + 1
    };
    setCurrentTask(optimisticTask);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          user_id: user.id,
          task_id: currentTask.id
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const updated = await response.json();
      const normalized = normalizeActiveTask(updated);
      setCurrentTask(normalized);
      upsertTaskSummary(updated);
    } catch (error) {
      console.error('Failed to send message:', error);
      setCurrentTask(currentTask);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImproveMessage = async (messageId: string, feedback: string) => {
    if (!currentTask || !user) return;
    const trimmed = feedback.trim();
    if (!trimmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/improve-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          task_id: currentTask.id,
          user_id: user.id,
          feedback: trimmed
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to improve message: ${response.status}`);
      }

      const updated = await response.json();
      const normalized = normalizeActiveTask(updated);
      setCurrentTask(normalized);
      upsertTaskSummary(updated);
    } catch (error) {
      console.error('Failed to improve message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchTask = async (taskId: string, options?: { silent?: boolean }) => {
    if (!user) return null;
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const response = await fetch(`${API_BASE_URL}/switch-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, user_id: user.id })
      });

      if (!response.ok) {
        throw new Error(`Failed to switch task: ${response.status}`);
      }

      const payload = await response.json();
      const normalized = normalizeActiveTask(payload);
      setCurrentTask(normalized);
      setActiveView('chat');
      upsertTaskSummary(payload);
      return normalized;
    } catch (error) {
      console.error('Failed to switch task:', error);
      return null;
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const handleCompleteTask = async () => {
    if (!currentTask || !user) return;
    try {
      const response = await fetch(`${API_BASE_URL}/complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: currentTask.id,
          user_id: user.id
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to complete task: ${response.status}`);
      }

      setCurrentTask(null);
      await fetchPreviousTasks(user.id);
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  const handleShowDashboard = () => setActiveView('dashboard');
  const handleShowChat = () => setActiveView('chat');

  if (!user) {
    return (
      <div className="auth-container">
        {authView === 'login' ? (
          <LoginForm
            onSubmit={handleLogin}
            onSwitchToSignup={() => {
              setAuthView('signup');
              setAuthError(null);
            }}
            isSubmitting={authLoading}
            error={authError}
          />
        ) : (
          <SignupForm
            onSubmit={handleSignup}
            onSwitchToLogin={() => {
              setAuthView('login');
              setAuthError(null);
            }}
            isSubmitting={authLoading}
            error={authError}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {showBaselineWizard && (
        <BaselineWizard userId={user.id} onComplete={handleBaselineCompleted} />
      )}
      <div className="app-container">
        <Sidebar
          onNewTask={handleNewTask}
          previousTasks={previousTasks}
          onSwitchTask={handleSwitchTask}
          isLoading={isLoading}
          onShowDashboard={handleShowDashboard}
          activeView={activeView}
          userName={user.name}
          userEmail={user.email}
          onLogout={handleLogout}
          activeTaskId={currentTask?.id}
        />
        {activeView === 'dashboard' ? (
          <ClarityDashboard
            onBack={handleShowChat}
            refreshKey={insightsRefreshKey}
            userDisplayName={userDisplayName ?? user.name}
            userId={user.id}
          />
        ) : (
          <ChatView
            currentTask={currentTask}
            onSendMessage={handleSendMessage}
            onCompleteTask={handleCompleteTask}
            isLoading={isLoading}
            formatTime={(timeInSeconds: number) => {
              const minutes = Math.floor(timeInSeconds / 60);
              const seconds = timeInSeconds % 60;
              return `${minutes} min ${seconds} sec`;
            }}
            onQuickStart={() => handleNewTask('Quick Chat', 'General')}
            onShowDashboard={handleShowDashboard}
            onInsightsRefresh={triggerInsightsRefresh}
            userId={user.id}
            onImproveMessage={handleImproveMessage}
          />
        )}
      </div>
    </>
  );
}

export default App;
