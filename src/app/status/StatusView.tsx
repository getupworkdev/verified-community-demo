'use client';
import Link from 'next/link';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { MyStatus } from '@/lib/session';
import { fmtDate } from '@/lib/shared';
import { Brand, Spinner } from '@/components/ui';
import { Check, Clock, Lock, Warn } from '@/components/icons';

async function signOut() {
  await supabaseBrowser().auth.signOut();
  window.location.href = '/';
}

function SignOut() {
  return <button className="link-btn small" style={{ alignSelf: 'center', fontWeight: 500, color: 'var(--muted)' }} onClick={signOut}>Sign out</button>;
}

function Appeal({ s }: { s: MyStatus }) {
  const [done, setDone] = useState(!!s.appeal_requested_at);
  const [busy, setBusy] = useState(false);
  async function ask() {
    setBusy(true);
    await supabaseBrowser().rpc('request_appeal', { p_text: null });
    setBusy(false);
    setDone(true);
  }
  return done ? (
    <div className="notice notice-sage"><Check /> Review requested. A different moderator will look at your account.</div>
  ) : (
    <button className="btn btn-primary" onClick={ask} disabled={busy}>{busy ? <Spinner /> : 'Ask for a review'}</button>
  );
}

export function StatusView({ s }: { s: MyStatus }) {
  if (s.status === 'pending') {
    return (
      <main className="app">
        <Brand />
        <div className="status-icon" style={{ background: '#e8efe9', color: 'var(--sage-deep)', alignSelf: 'center', marginTop: 24 }}><Clock /></div>
        <h1 className="center">Thank you, {s.first_name}</h1>
        <p className="muted center" style={{ fontSize: 17 }}>
          A member of our team is reviewing your photo and video personally. This usually takes up to 2 days.
        </p>
        <div className="steps">
          <div><span className="step-dot done"><Check size={16} /></span>Profile, photo and video received</div>
          <div><span className="step-dot" />Human review in progress</div>
          <div className="muted"><span className="step-dot todo" />Visible to approved members</div>
        </div>
        <div className="notice notice-info">
          <Lock size={20} />
          <span>Until you&apos;re approved, your profile is completely private: no one can find or see you, and you can&apos;t see other members yet.</span>
        </div>
        <div className="stack mt-auto">
          <Link className="btn btn-outline" href="/join/details">Edit my profile</Link>
          <Link className="btn btn-ghost" href="/join/media">Change photo or video</Link>
          <p className="small muted center">Changing your photo or video sends it back for review. You&apos;ll see it here when you&apos;re approved (email notifications come in the full build).</p>
          <SignOut />
        </div>
      </main>
    );
  }

  if (s.status === 'rejected') {
    const items = s.items ?? {};
    const rows: [string, string][] = [['Photo', items.photo], ['Video', items.video], ['Profile details', items.details]];
    const fixMedia = items.photo === 'needs_update' || items.video === 'needs_update';
    const label = items.photo === 'needs_update' && items.video === 'needs_update' ? 'Upload a new photo and video'
      : items.video === 'needs_update' ? 'Record a new video' : 'Upload a new photo';
    return (
      <main className="app">
        <Brand />
        <div className="status-icon" style={{ background: 'var(--amber-tint)', color: 'var(--amber)', marginTop: 24, width: 84, height: 84 }}><Warn size={36} /></div>
        <h1>A small change is needed</h1>
        <p className="muted" style={{ fontSize: 17 }}>Our team reviewed your profile and asked for one change before it can be approved.</p>
        <div className="card stack" style={{ gap: 8 }}>
          <span className="section-label" style={{ color: 'var(--amber)' }}>Reason from our moderator</span>
          <p style={{ fontSize: 17 }}>{s.reason}</p>
        </div>
        <div className="card stack" style={{ gap: 14 }}>
          {rows.map(([k, v]) => (
            <div className="row between" key={k}>
              <span>{k}</span>
              {v === 'needs_update' ? <span className="pill pill-amber">Needs update</span> : <span className="pill pill-sage">Looks good</span>}
            </div>
          ))}
        </div>
        <div className="stack mt-auto">
          <Link className="btn btn-primary" href={fixMedia ? '/join/media' : '/join/details'}>{fixMedia ? label : 'Update my details'}</Link>
          {fixMedia && items.details === 'needs_update' && <Link className="btn btn-outline" href="/join/details">Update my details</Link>}
          <p className="small muted center">Your profile stays private until it&apos;s approved. <a href="#support">Contact support</a></p>
          <SignOut />
        </div>
      </main>
    );
  }

  if (s.status === 'hidden') {
    return (
      <main className="app">
        <Brand />
        <div className="status-icon" style={{ background: '#eef0f3', color: 'var(--navy)', marginTop: 24, width: 84, height: 84 }}><Lock size={30} /></div>
        <h1>Your profile is hidden for now</h1>
        <p className="muted" style={{ fontSize: 17 }}>
          Several members raised a concern, so your profile is hidden while our team takes a look. You&apos;ll hear from us once it has been reviewed.
        </p>
        <div className="stack mt-auto"><a className="btn btn-outline" href="#guidelines">Read the community guidelines</a><SignOut /></div>
      </main>
    );
  }

  const banned = s.status === 'banned';
  return (
    <main className="app">
      <Brand />
      <div className="status-icon" style={{ background: '#eef0f3', color: 'var(--navy)', marginTop: 24, width: 84, height: 84 }}><Lock size={30} /></div>
      <h1>{banned ? 'Your account has been closed' : 'Your account is paused'}</h1>
      <p className="muted" style={{ fontSize: 17 }}>
        {banned ? (
          <>After a review, our team has closed your account. Your profile is hidden and you can&apos;t see or message members.</>
        ) : (
          <>After a review, our team has suspended your account until <strong style={{ color: 'var(--text)' }}>{fmtDate(s.suspended_until)}</strong>. While it&apos;s paused, your profile is hidden and you can&apos;t see or message members.</>
        )}
      </p>
      <div className="card stack" style={{ gap: 6 }}>
        <span className="section-label">Reason</span>
        <p style={{ fontSize: 17 }}>{s.reason}</p>
      </div>
      <p className="muted small">If you think this is a mistake, you can ask us to look again. A different moderator will review it.</p>
      <div className="stack mt-auto">
        <Appeal s={s} />
        <a className="btn btn-ghost" href="#guidelines" style={{ border: 0, textDecoration: 'underline' }}>Read the community guidelines</a>
        <SignOut />
      </div>
    </main>
  );
}
