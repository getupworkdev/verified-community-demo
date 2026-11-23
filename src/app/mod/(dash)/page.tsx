'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  FIXED_PROMPTS, REJECT_REASONS, REPORT_LABEL, ago, countryName, duration, fmtDate, friendly, waiting,
} from '@/lib/shared';
import { Loading, SIGNED_SECONDS, Spinner, useSigned, useToast } from '@/components/ui';
import { Check, Play, Warn } from '@/components/icons';
import { refreshCounts, type Counts } from './ModTop';

type QItem = { id: string; name: string; age: number; city: string; review_kind: string; submitted_at: string; open_reports: number; hidden: boolean };
type Detail = {
  id: string; first_name: string; last_name: string; age: number; city: string; country: string; country_code: string;
  detected_country: string | null; languages: string[]; faith: string | null; about: string; community: string; looking_for: string;
  answers: Record<string, string>; prompt4: string | null; prompt5: string | null; photo_path: string | null; video_path: string | null;
  video_seconds: number | null; status: string; review_kind: string; submitted_at: string; hue: number; report_hidden: boolean;
  notes: { author: string; note: string; at: string }[];
  reports: { reason: string; details: string | null; at: string; status: string }[];
  history: { actor: string; action: string; detail: string | null; at: string }[];
};

function Countdown({ until }: { until: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!until) return null;
  const s = Math.max(0, Math.round((until - now) / 1000));
  return <>{s > 0 ? `signed link, expires in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'link expired, press play to renew'}</>;
}

function Review({ id, onDone }: { id: string; onDone: (msg: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [langs, setLangs] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const photo = useSigned(d?.photo_path);
  const video = useSigned(playing ? d?.video_path : null);

  useEffect(() => {
    setD(null); setReason(''); setMessage(''); setNote(''); setLangs(false); setPlaying(false); setError(null);
    supabaseBrowser().rpc('mod_profile', { p_id: id }).then(({ data }) => setD(data));
  }, [id]);

  async function act(action: 'approve' | 'reject' | 'flag') {
    if (action === 'reject' && !reason) { setError('Choose a reason before rejecting. The member sees it.'); return; }
    setBusy(action);
    setError(null);
    const r = REJECT_REASONS.find((x) => x.code === reason);
    const { error } = await supabaseBrowser().rpc('mod_decide', {
      p_id: id, p_action: action, p_reason: action === 'reject' ? message || r?.message : null,
      p_items: action === 'reject' ? r?.items : null, p_note: note || null, p_languages_confirmed: langs,
    });
    setBusy(null);
    if (error) { setError(friendly(error)); return; }
    onDone(action === 'approve' ? `${d?.first_name} approved and now visible to members` : action === 'reject' ? `${d?.first_name} asked for a change` : `${d?.first_name} flagged for admin`);
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy('note');
    await supabaseBrowser().rpc('mod_add_note', { p_id: id, p_note: note });
    const { data } = await supabaseBrowser().rpc('mod_profile', { p_id: id });
    setD(data); setNote(''); setBusy(null);
  }

  if (!d) return <Loading />;
  const match = d.detected_country && d.detected_country.toUpperCase() === d.country_code.toUpperCase();
  const prompts = [...FIXED_PROMPTS, d.prompt4 ?? '(not chosen)', d.prompt5 ?? '(not chosen)'];

  return (
    <>
      <div className="row between wrap">
        <h2 style={{ fontSize: 26 }}>{d.first_name} {d.last_name.charAt(0)}., {d.age} · {d.city}</h2>
        <div className="row wrap" style={{ gap: 6 }}>{d.languages.map((l) => <span key={l} className="pill pill-blue">{l}</span>)}</div>
      </div>
      {d.report_hidden && (
        <div className="notice notice-danger"><Warn size={20} /> Hidden automatically after {d.reports.filter((r) => r.status === 'open').length} reports. Approving restores the profile; rejecting asks the member for changes.</div>
      )}
      <div className="mod-media">
        <div className={`mod-photo hue-${d.hue}`}>
          {d.first_name.replace(/^Pastor /, '').charAt(0)}
          {photo.url && <img src={photo.url} alt="Submitted photo" />}
        </div>
        <div className="mod-video">
          {playing && video.url ? (
            <video src={video.url} controls autoPlay playsInline onError={() => video.refresh()} />
          ) : (
            <button onClick={() => setPlaying(true)} style={{ flex: 1, border: 0, background: 'none', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', gap: 10, minHeight: 220 }}>
              <span style={{ width: 60, height: 60, borderRadius: '50%', background: '#fff', color: '#24303c', display: 'grid', placeItems: 'center' }}>{playing ? <Spinner /> : <Play size={22} />}</span>
            </button>
          )}
          <div className="cap">
            Video · {duration(d.video_seconds)} · prompts 1–5 · {playing ? <Countdown until={video.expiresAt} /> : `signed link, expires ${SIGNED_SECONDS / 60} min after opening`}
          </div>
        </div>
      </div>

      <div className="facts">
        <div className="fact"><div className="k">Stated country</div><div className="v">{d.country}</div></div>
        <div className="fact">
          <div className="k">Detected country (from sign-up IP)</div>
          <div className="v" style={{ color: match ? 'var(--sage-deep)' : 'var(--amber)' }}>
            {d.detected_country ? <>{countryName(d.detected_country)} {match ? <><Check size={15} /> matches</> : '· differs'}</> : 'Not available'}
          </div>
        </div>
        <label className="fact row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={langs} onChange={(e) => setLangs(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--navy)' }} />
          <span>{d.languages.length > 1 ? 'All languages heard in video' : `${d.languages[0]} heard in video`}</span>
        </label>
      </div>

      <div className="mod-grid-2">
        <div className="card stack">
          <strong style={{ color: 'var(--navy)' }}>Profile</strong>
          <p className="small">{d.about || <span className="muted">No text yet.</span>}</p>
          <div className="small muted">
            Looking for {d.looking_for} · Community {d.community || '[Field]'} · Faith {d.faith ?? 'not stored (no consent)'}
            {Object.entries(d.answers ?? {}).map(([k, v]) => <span key={k}> · {k.replace(/_/g, ' ')}: {v}</span>)}
          </div>
          <strong style={{ color: 'var(--navy)', marginTop: 6 }}>Prompts answered in the video</strong>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{prompts.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </div>
        <div className="card stack">
          <strong style={{ color: 'var(--navy)' }}>Team notes</strong>
          {d.notes.length === 0 && <span className="small muted">No notes yet.</span>}
          {d.notes.map((n, i) => <div key={i} className="small"><strong>{n.author}</strong> · <span className="muted">{ago(n.at)} ago</span><br />{n.note}</div>)}
          {d.reports.length > 0 && <strong style={{ color: 'var(--navy)', marginTop: 6 }}>Reports</strong>}
          {d.reports.map((r, i) => <div key={i} className="small">{REPORT_LABEL[r.reason]} · <span className="muted">{ago(r.at)} ago{r.status === 'resolved' ? ' · resolved' : ''}</span>{r.details && <><br />&ldquo;{r.details}&rdquo;</>}</div>)}
        </div>
      </div>

      <div className="card stack">
        <label className="field">
          <span>Reason (required to reject)</span>
          <select className="select" value={reason} onChange={(e) => { setReason(e.target.value); setMessage(REJECT_REASONS.find((r) => r.code === e.target.value)?.message ?? ''); }}>
            <option value="">Choose a reason…</option>
            {REJECT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </label>
        {reason && (
          <label className="field">
            <span>Message the member will see</span>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 70 }} />
          </label>
        )}
        <label className="field">
          <span>Private note for the team</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row wrap">
          <button className="btn btn-sage btn-sm" style={{ minHeight: 46 }} onClick={() => act('approve')} disabled={!!busy}>{busy === 'approve' ? <Spinner /> : 'Approve'}</button>
          <button className="btn btn-danger btn-sm" style={{ minHeight: 46 }} onClick={() => act('reject')} disabled={!!busy}>{busy === 'reject' ? <Spinner /> : 'Reject with reason'}</button>
          <button className="btn btn-amber-outline btn-sm" style={{ minHeight: 46 }} onClick={() => act('flag')} disabled={!!busy || d.review_kind === 'flagged'}>{busy === 'flag' ? <Spinner /> : 'Flag for admin'}</button>
          <button className="btn btn-ghost btn-sm" style={{ minHeight: 46, marginLeft: 'auto' }} onClick={addNote} disabled={!note.trim() || !!busy}>Save note only</button>
        </div>
      </div>

      {d.history.length > 0 && (
        <div className="card">
          <strong style={{ color: 'var(--navy)' }}>History</strong>
          {d.history.map((h, i) => (
            <div key={i} className="audit-item"><strong>{h.actor}</strong> {h.action}{h.detail ? ` · ${h.detail}` : ''}<div className="tiny muted">{fmtDate(h.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Queue() {
  const toast = useToast();
  const [filter, setFilter] = useState<'new' | 'changed' | 'flagged'>('new');
  const [items, setItems] = useState<QItem[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async (f = filter, keep?: string | null) => {
    const sb = supabaseBrowser();
    const [{ data }, { data: c }] = await Promise.all([sb.rpc('mod_queue', { p_filter: f }), sb.rpc('mod_counts')]);
    setItems(data as QItem[]);
    setCounts(c);
    const list = (data as QItem[]) ?? [];
    setSel(keep && list.some((x) => x.id === keep) ? keep : list[0]?.id ?? null);
  }, [filter]);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div className="queue">
      <aside className="queue-side">
        <div className="row wrap" style={{ gap: 6 }}>
          {(['new', 'changed', 'flagged'] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} style={{ minHeight: 34, fontSize: 13.5, padding: '0 12px' }} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}{counts ? ` · ${counts[f]}` : ''}
            </button>
          ))}
        </div>
        {!items ? <Loading /> : items.length === 0 ? <p className="small muted" style={{ padding: 8 }}>Nothing waiting here.</p> : items.map((q) => {
          const late = (Date.now() - new Date(q.submitted_at).getTime()) / 3600000 >= 48;
          const label = q.hidden ? `Auto-hidden · ${q.open_reports} reports` : q.review_kind === 'changed' ? 'New photo or video · re-review' : q.review_kind === 'flagged' ? 'Flagged for admin' : 'New profile';
          return (
            <button key={q.id} className={`q-item ${sel === q.id ? 'sel' : ''} ${late ? 'late' : ''}`} onClick={() => setSel(q.id)}>
              <strong>{q.name}, {q.age}</strong>
              <span className="small" style={{ color: late ? 'var(--amber)' : 'var(--muted)' }}>{label} · {waiting(q.submitted_at)}</span>
            </button>
          );
        })}
      </aside>
      <section className="queue-main">
        {sel ? (
          <Review id={sel} onDone={(msg) => { toast.show(msg); refreshCounts(); load(filter); }} />
        ) : items ? (
          <div className="card center stack" style={{ padding: 40 }}><h2>All caught up</h2><p className="muted">No profiles waiting in this list.</p></div>
        ) : null}
      </section>
      {toast.node}
    </div>
  );
}
