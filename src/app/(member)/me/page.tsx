'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtDate, friendly } from '@/lib/shared';
import { Avatar, Loading, Sheet, Spinner, useToast } from '@/components/ui';
import { Check } from '@/components/icons';

type Me = { id: string; first_name: string; city: string; hue: number; photo_path: string | null; photo_visibility: string; video_visibility: string; faith: string | null };
type Consent = { id: number; kind: string; version: string; granted: boolean; created_at: string };
type Blocked = { id: string; first_name: string; city: string; hue: number };

const CONSENT_LABEL: Record<string, string> = {
  age_18: 'I am 18 or older', terms_privacy: 'Terms and Privacy Policy', faith_data: 'Faith-related answers stored and shown',
};

export default function MePage() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [open, setOpen] = useState<null | 'blocked' | 'consents'>(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    const [{ data: p }, { data: c }, { data: b }] = await Promise.all([
      sb.from('profiles').select('id, first_name, city, hue, photo_path, photo_visibility, video_visibility, faith').eq('id', user!.id).single(),
      sb.from('consents').select('*').order('created_at', { ascending: false }),
      sb.rpc('my_blocks'),
    ]);
    setMe(p as Me);
    setConsents((c as Consent[]) ?? []);
    setBlocked((b as Blocked[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setVis(kind: 'photo' | 'video', v: string) {
    if (!me) return;
    const next = { ...me, [`${kind}_visibility`]: v };
    setMe(next);
    const { error } = await supabaseBrowser().rpc('set_visibility', { p_photo: next.photo_visibility, p_video: next.video_visibility });
    if (error) { toast.show(friendly(error)); load(); } else toast.show('Saved');
  }

  async function unblock(id: string) {
    await supabaseBrowser().rpc('unblock_member', { p_id: id });
    toast.show('Unblocked');
    load();
  }

  async function withdrawFaith() {
    await supabaseBrowser().rpc('set_faith_consent', { p_granted: false });
    toast.show('Consent withdrawn. Your faith answers were removed.');
    load();
  }

  async function download() {
    const { data } = await supabaseBrowser().rpc('export_my_data');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-data.json';
    a.click();
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/delete-account', { method: 'POST' });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(out.error ?? 'Could not delete the account.'); return; }
    await supabaseBrowser().auth.signOut();
    window.location.href = '/?deleted=1';
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = '/';
  }

  if (!me) return <main className="app with-nav"><Loading /></main>;
  const faithGranted = consents.find((c) => c.kind === 'faith_data')?.granted;

  return (
    <main className="app with-nav">
      <div className="card row" style={{ gap: 14 }}>
        <Avatar name={me.first_name} hue={me.hue} size={56} path={me.photo_path} />
        <div className="grow">
          <strong style={{ fontSize: 18 }}>{me.first_name}</strong>
          <div className="small" style={{ color: 'var(--sage-deep)' }}><Check size={13} /> Verified · {me.city}</div>
        </div>
      </div>
      <div className="grid-2">
        <Link className="btn btn-ghost btn-sm" style={{ width: '100%' }} href="/join/details">Edit profile</Link>
        <Link className="btn btn-ghost btn-sm" style={{ width: '100%' }} href="/join/media">Photo and video</Link>
      </div>

      <h1>Privacy and your data</h1>
      <span className="section-label">Who can see my</span>
      {(['photo', 'video'] as const).map((k) => (
        <div className="card stack" key={k}>
          <strong style={{ fontSize: 17 }}>{k === 'photo' ? 'Photo' : 'Introduction video'}</strong>
          <div className="seg">
            {[['members', 'Approved members'], ['accepted', 'Only people I accept']].map(([v, l]) => (
              <button key={v} className={me[`${k}_visibility`] === v ? 'on' : ''} onClick={() => setVis(k, v)}>{l}</button>
            ))}
          </div>
          {k === 'video' && <p className="small muted">Moderators can always view it to keep the community safe.</p>}
        </div>
      ))}

      <span className="section-label">Your data</span>
      <div className="list">
        <button className="list-row" onClick={() => setOpen(open === 'blocked' ? null : 'blocked')}>
          Blocked members <span className="chev">{blocked.length} ›</span>
        </button>
        {open === 'blocked' && (
          <div className="list-sub">
            {blocked.length === 0 && <span className="muted">You haven&apos;t blocked anyone.</span>}
            {blocked.map((b) => (
              <div className="row between" key={b.id}>
                <span className="row"><Avatar name={b.first_name} hue={b.hue} size={34} /> {b.first_name} · <span className="muted">{b.city}</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => unblock(b.id)}>Unblock</button>
              </div>
            ))}
          </div>
        )}
        <button className="list-row" onClick={() => setOpen(open === 'consents' ? null : 'consents')}>
          Consents I&apos;ve given <span className="chev">›</span>
        </button>
        {open === 'consents' && (
          <div className="list-sub">
            {consents.map((c) => (
              <div key={c.id} className="row between">
                <span>{CONSENT_LABEL[c.kind]}<br /><span className="tiny muted">{c.granted ? 'Given' : 'Withdrawn'} {fmtDate(c.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · version {c.version}</span></span>
                {c.granted ? <span className="pill pill-sage">Given</span> : <span className="pill pill-grey">Withdrawn</span>}
              </div>
            ))}
            {faithGranted && <button className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={withdrawFaith}>Withdraw faith-data consent</button>}
          </div>
        )}
        <button className="list-row" onClick={download}>Download a copy of my data <span className="chev">›</span></button>
      </div>

      <button className="btn btn-danger-outline" onClick={() => setDel(true)}>Delete my account</button>
      <p className="small muted center">Deleting removes your profile, messages, photo and video, including from our video provider. This can&apos;t be undone.</p>
      <button className="link-btn small" style={{ alignSelf: 'center', color: 'var(--muted)', fontWeight: 500 }} onClick={signOut}>Sign out</button>

      {del && (
        <Sheet onClose={() => setDel(false)} label="Delete account">
          <h2>Delete your account?</h2>
          <p className="muted">Your profile, messages, photo and video are removed permanently. Other members will no longer see you.</p>
          {error && <p className="notice notice-amber">{error}</p>}
          <button className="btn btn-danger" onClick={deleteAccount} disabled={busy}>{busy ? <Spinner /> : 'Delete permanently'}</button>
          <button className="btn btn-ghost" onClick={() => setDel(false)}>Keep my account</button>
        </Sheet>
      )}
      {toast.node}
    </main>
  );
}
