import { useState } from 'react';
import { Text, View } from 'react-native';
import { getCtx, toast } from './ctx';
import { Btn, Field, Segmented, text } from './ui';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/**
 * Create an account (email + username + password) or sign in (email or username + password).
 * The account is what syncs your library between devices; the username is shown on community collections.
 */
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
      toast(mode === 'register' ? 'Account created' : 'Signed in and synced');
      onDone?.();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={{ marginBottom: 14 }}>
        <Segmented
          value={mode}
          options={[{ value: 'register', label: 'Create account' }, { value: 'login', label: 'Sign in' }]}
          onChange={setMode}
        />
      </View>
      {mode === 'register' && (
        <>
          <Field label="Username (shown on collections you share)" value={username} onChangeText={setUsername} placeholder="e.g. naruto_fan" maxLength={20} />
          {username.length > 0 && !usernameOk && <Text style={[text.warn, { marginTop: -6, marginBottom: 8 }]}>3-20 letters, numbers or underscores.</Text>}
        </>
      )}
      <Field
        label={mode === 'register' ? 'Email' : 'Email or username'}
        value={email}
        onChangeText={setEmail}
        keyboardType={mode === 'register' ? 'email-address' : 'default'}
        textContentType="username"
      />
      <Field
        label={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        onSubmitEditing={go}
      />
      <Btn title={mode === 'register' ? 'Create account' : 'Sign in'} kind="primary" disabled={!ready || busy} onPress={go} />
      {mode === 'login' && <Text style={[text.small, { marginTop: 10 }]}>Signing in restores your library, groups and devices.</Text>}
    </View>
  );
}
