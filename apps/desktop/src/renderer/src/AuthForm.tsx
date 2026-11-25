import { useState } from 'react';
import { getCtx } from './ctx';
import { toast } from './toast';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/** Create an account (email + username + password) or sign in (email or username + password). */
export function AuthForm({ onDone, initial = 'register' }: { onDone?: () => void; initial?: 'register' | 'login' }) {
  const { sync } = getCtx();
  const [mode, setMode] = useState<'register' | 'login'>(initial);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameOk = USERNAME_RE.test(username.trim());
  const ready = mode === 'register' ? usernameOk && email.includes('@') && password.length >= 8 : email.trim().length >= 3 && password.length > 0;

  const go = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await sync.authenticate(mode, email.trim(), password, { username: username.trim() });
      toast(mode === 'register' ? 'Account created.' : 'Signed in and synced.', 'ok');
      onDone?.();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <div className="chips">
        <button type="button" className={'chip' + (mode === 'register' ? ' on' : '')} onClick={() => setMode('register')}>Create account</button>
        <button type="button" className={'chip' + (mode === 'login' ? ' on' : '')} onClick={() => setMode('login')}>Sign in</button>
      </div>
      {mode === 'register' && (
        <label>
          Username <span className="muted small">(shown on collections you share)</span>
          <input value={username} maxLength={20} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. naruto_fan" />
          {username.length > 0 && !usernameOk && <span className="warn small">3-20 letters, numbers or underscores.</span>}
        </label>
      )}
      <label>{mode === 'register' ? 'Email' : 'Email or username'}<input type={mode === 'register' ? 'email' : 'text'} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>{mode === 'register' ? 'Password (8+ characters)' : 'Password'}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="primary" type="submit" disabled={!ready || busy}>{mode === 'register' ? 'Create account' : 'Sign in'}</button>
    </form>
  );
}
