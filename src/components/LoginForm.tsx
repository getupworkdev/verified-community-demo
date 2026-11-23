'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { friendly } from '@/lib/shared';
import { Spinner } from './ui';

type Demo = { label: string; email: string; password: string };

export function LoginForm({ staff, demos }: { staff: boolean; demos: Demo[] }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setError(friendly(error)); return; }
    const { data: me } = await sb.rpc('my_status');
    if (staff && !me?.staff) {
      await sb.auth.signOut();
      setBusy(false);
      setError("This account doesn't have moderator access.");
      return;
    }
    if (!staff && me?.staff) {
      window.location.href = '/mod';
      return;
    }
    window.location.href = staff ? '/mod' : '/';
  }

  return (
    <form className="stack-lg" onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button>
      {demos.length > 0 && (
        <div className="card stack" style={{ background: 'var(--info)', border: 0 }}>
          <strong className="small" style={{ color: 'var(--navy)' }}>Demo accounts</strong>
          <div className="row wrap">
            {demos.map((d) => (
              <button type="button" key={d.email} className="btn btn-ghost btn-sm" style={{ background: '#fff' }}
                onClick={() => { setEmail(d.email); setPassword(d.password); }}>
                {d.label}
              </button>
            ))}
          </div>
          <span className="tiny muted">Tap to fill in the email and password, then sign in.</span>
        </div>
      )}
    </form>
  );
}
