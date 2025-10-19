import { FormEvent, useState } from 'react';
import '../../styles/Auth.css';

type LoginFormProps = {
  onSubmit: (payload: { email: string; password: string }) => Promise<void>;
  onSwitchToSignup: () => void;
  isSubmitting: boolean;
  error?: string | null;
};

const LoginForm = ({ onSubmit, onSwitchToSignup, isSubmitting, error }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!email.trim() || !password.trim()) {
      return;
    }
    try {
      await onSubmit({ email: email.trim(), password });
    } catch {
      // Parent handles error state
    }
  };

  const hasValidationError = touched && (!email.trim() || !password.trim());

  return (
    <div className="auth-card">
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">Log in to continue building your clarity dashboard.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-label">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="auth-input"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="auth-input"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>
        {(error || hasValidationError) && (
          <div className="auth-error">
            {error || 'Enter both email and password to continue.'}
          </div>
        )}
        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footer">
        New to QOG?{' '}
        <button className="auth-link" type="button" onClick={onSwitchToSignup}>
          Create an account
        </button>
      </p>
      <p className="auth-note">Prototype notice: credentials are stored in plaintext on this device.</p>
    </div>
  );
};

export default LoginForm;
