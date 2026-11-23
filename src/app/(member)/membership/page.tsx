'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtDate, friendly } from '@/lib/shared';
import { Loading, Spinner } from '@/components/ui';
import { Check, Close, StarFill } from '@/components/icons';

type Info = { founding_total: number; founding_left: number; membership: string; until: string | null; active: boolean };

function Membership() {
  const router = useRouter();
  const from = useSearchParams().get('from');
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { supabaseBrowser().rpc('membership_info').then(({ data }) => setInfo(data)); }, []);

  async function claim() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc('claim_founding');
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    setInfo(data);
    if (from) router.push(`/members/${from}`);
  }

  if (!info) return <main className="app"><Loading /></main>;
  const label = { founding: 'Founding member', paid: 'Member', complimentary: 'Complimentary membership', none: '' }[info.membership];

  return (
    <main className="app with-nav">
      <button className="back" onClick={() => (from ? router.push(`/members/${from}`) : router.push('/discover'))} aria-label="Close"><Close /></button>
      <h1>Start meaningful conversations</h1>
      <p className="muted" style={{ fontSize: 17 }}>One simple membership, the same price for everyone.</p>
      {from && !info.active && <div className="notice notice-info">Starting a conversation needs a membership. Replying to anyone who writes to you is always free.</div>}

      {info.active ? (
        <div className="card row" style={{ background: 'var(--sage-tint)', border: 0, gap: 14 }}>
          <span className="avatar" style={{ width: 52, height: 52, background: '#fff', color: 'var(--sage-deep)' }}><Check /></span>
          <div>
            <strong style={{ color: 'var(--sage-deep)', fontSize: 18 }}>{label}</strong>
            <div className="small muted">{info.until ? `Free until ${fmtDate(info.until, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Active'}. You can start conversations with any member.</div>
          </div>
        </div>
      ) : (
        <div className="card row" style={{ background: '#fff8ec', borderColor: 'var(--amber-line)', gap: 14 }}>
          <span className="avatar" style={{ width: 52, height: 52, background: '#f1dfbf', color: 'var(--amber)' }}><StarFill /></span>
          <div>
            <strong style={{ color: 'var(--amber)', fontSize: 18 }}>Founding member offer</strong>
            <div className="small" style={{ color: 'var(--amber)' }}>3 months free for our first {info.founding_total} members. {info.founding_left} places left.</div>
          </div>
        </div>
      )}

      <div className="card stack" style={{ borderColor: 'var(--navy)', borderWidth: 1.5 }}>
        <div className="row between">
          <strong style={{ color: 'var(--navy)', fontSize: 19 }}>Membership</strong>
          <span><span className="serif" style={{ fontSize: 30, color: 'var(--navy)', fontWeight: 600 }}>[Price]</span><span className="muted"> / month</span></span>
        </div>
        {['Start conversations with any member', 'See who has viewed your profile', 'Cancel anytime from your account'].map((t) => (
          <div key={t} className="row" style={{ color: 'var(--text)' }}><span style={{ color: 'var(--sage)' }}><Check size={18} /></span>{t}</div>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--info)', border: 0 }}>
        <strong className="small" style={{ color: 'var(--navy)' }}>Always free</strong>
        <p className="small muted">Creating a profile, browsing verified members, and replying to anyone who writes to you.</p>
      </div>

      {error && <p className="err">{error}</p>}
      {!info.active && (
        <div className="stack mt-auto">
          <button className="btn btn-primary" onClick={claim} disabled={busy || info.founding_left <= 0}>{busy ? <Spinner /> : 'Claim 3 free months'}</button>
          <p className="small muted center">Secure payment. Then [Price] a month unless you cancel.</p>
        </div>
      )}
      <p className="demo-note">Demo mode: no payment is taken and no card is asked for. The live app uses a payment provider here.</p>
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Membership /></Suspense>;
}
