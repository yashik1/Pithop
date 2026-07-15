import { useState } from 'react';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth';

// Sign-in gate shown inside the add-place card when adding requires an account.
// Google (redirect) plus email/password with a sign-in ⇄ create-account toggle.
export function AuthPanel() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'in') {
        await signInWithEmail(email.trim(), password);
        // On success the auth listener swaps this panel for the form.
      } else {
        const { needsConfirm } = await signUpWithEmail(email.trim(), password);
        if (needsConfirm) setInfo('Check your inbox to confirm your email, then sign in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel">
      <p className="auth-intro">Sign in to add a place — it keeps community spots trustworthy.</p>
      <button type="button" className="auth-google" onClick={() => void signInWithGoogle()}>
        <span className="auth-g">G</span> Continue with Google
      </button>
      <div className="auth-or">
        <span>or</span>
      </div>
      <form onSubmit={submit}>
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={mode === 'in' ? 'Password' : 'Create a password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="auth-error">⚠️ {error}</div>}
        {info && <div className="auth-info">✉️ {info}</div>}
        <button type="submit" className="auth-submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        type="button"
        className="auth-toggle"
        onClick={() => {
          setMode((m) => (m === 'in' ? 'up' : 'in'));
          setError(null);
          setInfo(null);
        }}
      >
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
