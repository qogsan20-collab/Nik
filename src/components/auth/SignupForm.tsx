import { FormEvent, useState } from 'react';
import '../../styles/Auth.css';

type SignupFormProps = {
  onSubmit: (payload: { name: string; email: string; password: string }) => Promise<void>;
  onSwitchToLogin: () => void;
  isSubmitting: boolean;
  error?: string | null;
};

const SignupForm = ({ onSubmit, onSwitchToLogin, isSubmitting, error }: SignupFormProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!name.trim() || !email.trim() || !password.trim()) {
      return;
    }
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), password });
    } catch {
      // Parent handles error state
    }
  };

  const hasValidationError = touched && (!name.trim() || !email.trim() || !password.trim());

  return (
    <div className="auth-card">
      <h1 className="auth-title">Create your workspace</h1>
      <p className="auth-subtitle">Tell us who you are and we’ll calibrate your first baseline.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-label">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="auth-input"
            placeholder="Nikhil Khatale"
            autoComplete="name"
            required
          />
        </label>
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
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
        </label>
        {(error || hasValidationError) && (
          <div className="auth-error">
            {error || 'Name, email, and password are required.'}
          </div>
        )}
        <button type="submit" className="auth-button" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="auth-footer">
        Already have an account?{' '}
        <button className="auth-link" type="button" onClick={onSwitchToLogin}>
          Sign in
        </button>
      </p>
      <p className="auth-note">Prototype notice: credentials are stored in plaintext on this device.</p>
    </div>
  );
};

export default SignupForm;
