import { useState } from 'react';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth';
import { t } from '../lib/i18n';

// Sign-in gate shown inside the add-place card when adding requires an account.
// Google (redirect) plus email/password with a sign-in ⇄ create-account toggle.
export function AuthPanel() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function google() {
    if (gBusy) return;
    setGBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // On success the browser navigates away; if we're still here after a
      // moment, something upstream refused the redirect.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGBusy(false);
      return;
    }
    window.setTimeout(() => setGBusy(false), 4000);
  }

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
      <p className="auth-intro">{t('signInPrompt')}</p>
      <button type="button" className="auth-google" disabled={gBusy} onClick={() => void google()}>
        <span className="auth-g">G</span> {gBusy ? '…' : t('continueGoogle')}
      </button>
      <div className="auth-or">
        <span>{t('orSep')}</span>
      </div>
      <form onSubmit={submit}>
        <input
          type="email"
          autoComplete="email"
          placeholder={t('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={mode === 'in' ? t('password') : t('passwordNew')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="auth-error">⚠️ {error}</div>}
        {info && <div className="auth-info">✉️ {info}</div>}
        <button type="submit" className="auth-submit" disabled={busy || !email.trim() || !password}>
          {busy ? '…' : mode === 'in' ? t('signIn') : t('createAccount')}
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
        {mode === 'in' ? t('newHere') : t('haveAccount')}
      </button>
    </div>
  );
}
