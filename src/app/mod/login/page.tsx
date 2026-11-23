import { redirect } from 'next/navigation';
import { getMyStatus } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';
import { BodyClass } from '@/components/ui';
import { BRAND } from '@/lib/shared';
import { Shield } from '@/components/icons';

export default async function ModLogin() {
  const s = await getMyStatus();
  if (s.staff) redirect('/mod');
  return (
    <>
      <BodyClass name="staff" />
      <div className="mod-top"><span className="title">{BRAND} · Moderation</span></div>
      <main className="app" style={{ background: 'transparent', border: 0, maxWidth: 440, minHeight: 0, paddingTop: 48 }}>
        <div className="card stack-lg" style={{ padding: 28 }}>
          <div className="row" style={{ color: 'var(--sage-deep)' }}><Shield /> <span className="small">Staff only</span></div>
          <h1 style={{ fontSize: 26 }}>Moderator sign-in</h1>
          {s.signed_in && (
            <p className="notice notice-amber">You&apos;re signed in as a member. Signing in here switches to a staff account.</p>
          )}
          <LoginForm staff demos={[{ label: 'Anna · moderator and admin', email: 'anna@example.com', password: 'Anna-moderator-2026' }]} />
          <p className="tiny muted">Staff roles live in a separate table that no account can write to through the app or the API.</p>
        </div>
      </main>
    </>
  );
}
