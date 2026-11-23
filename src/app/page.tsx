import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { Brand } from '@/components/ui';
import { Check } from '@/components/icons';

export default async function Welcome() {
  const s = await getMyStatus();
  if (s.signed_in) redirect(homeFor(s));

  return (
    <main className="app">
      <Brand mark />
      <div className="card row" style={{ background: '#e8efe9', border: 0, justifyContent: 'center', gap: 18, padding: '56px 12px', borderRadius: 24 }}>
        <span className="avatar hue-0" style={{ width: 76, height: 76, fontSize: 34 }}>R</span>
        <span className="avatar hue-1" style={{ width: 96, height: 96, fontSize: 44 }}>D</span>
        <span className="avatar hue-2" style={{ width: 76, height: 76, fontSize: 34 }}>S</span>
      </div>
      <h1 style={{ fontSize: 38 }}>Meet people who share your faith, safely.</h1>
      <p className="muted" style={{ fontSize: 17.5 }}>
        Every member is personally verified by our team, by video, before anyone can see their profile.
      </p>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--sage-deep)', gap: 8 }}>
        {['Human-reviewed video for every profile', 'You choose who sees your photo and video', 'Free to join, browse and reply'].map((t) => (
          <li key={t} className="row"><Check /> {t}</li>
        ))}
      </ul>
      <div className="stack">
        <Link className="btn btn-primary" href="/join">Join the community</Link>
        <Link className="btn btn-outline" href="/login">I already have an account</Link>
      </div>
      <p className="small muted center">Members must be 18 or older.</p>
      <p className="demo-note">
        Demo version. <Link href="/mod/login" style={{ color: 'inherit' }}>Moderator sign-in</Link>
      </p>
    </main>
  );
}
