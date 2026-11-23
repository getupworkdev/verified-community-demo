'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { CHOICE_PROMPTS, FIXED_PROMPTS, duration, friendly } from '@/lib/shared';
import { Sheet, Spinner, useSigned } from '@/components/ui';
import { Back, Info, Person } from '@/components/icons';
import { StepHeader } from '../JoinForm';

type Initial = {
  id: string; first_name: string; status: string; photo_path: string | null; video_path: string | null;
  video_seconds: number | null; prompt4: string | null; prompt5: string | null; languages: string[];
  decision_items: Record<string, string>;
};

const MAX_BYTES = 50 * 1024 * 1024;

function videoLength(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null); };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
    setTimeout(() => resolve(null), 4000);
  });
}

function listJoin(xs: string[]) {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function MediaForm({ initial }: { initial: Initial }) {
  const draft = initial.status === 'draft';
  const live = initial.status === 'approved';
  const [photoPath, setPhotoPath] = useState(initial.photo_path);
  const [videoPath, setVideoPath] = useState(initial.video_path);
  const [seconds, setSeconds] = useState(initial.video_seconds);
  const [p4, setP4] = useState(initial.prompt4 ?? '');
  const [p5, setP5] = useState(initial.prompt5 ?? '');
  const [busy, setBusy] = useState<null | 'photo' | 'video' | 'submit'>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentBack, setSentBack] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'photo' | 'video'; file: File }>(null);
  const photo = useSigned(photoPath);
  const video = useSigned(videoPath);

  useEffect(() => {
    if (!draft && (p4 !== (initial.prompt4 ?? '') || p5 !== (initial.prompt5 ?? '')) && p4 && p5) {
      supabaseBrowser().rpc('set_my_prompts', { p_prompt4: p4, p_prompt5: p5 });
    }
  }, [p4, p5, draft, initial.prompt4, initial.prompt5]);

  function pick(kind: 'photo' | 'video', file?: File | null) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('This demo accepts files up to 50 MB (about a minute of phone video). The live app uses resumable uploads for full-length videos.');
      return;
    }
    if (live) setConfirm({ kind, file });
    else upload(kind, file);
  }

  async function loadSample(kind: 'photo' | 'video') {
    const res = await fetch(kind === 'photo' ? '/samples/sample-photo.jpg' : '/samples/sample-video.mp4');
    const blob = await res.blob();
    pick(kind, new File([blob], kind === 'photo' ? 'sample.jpg' : 'sample.mp4', { type: blob.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4') }));
  }

  async function upload(kind: 'photo' | 'video', file: File) {
    setConfirm(null);
    setBusy(kind);
    setError(null);
    const sb = supabaseBrowser();
    const ext = (file.name.split('.').pop() || (kind === 'photo' ? 'jpg' : 'mp4')).toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${initial.id}/${kind}-${Date.now()}.${ext}`;
    const secs = kind === 'video' ? await videoLength(file) : null;
    const { error: upErr } = await sb.storage.from('media').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) { setBusy(null); setError(friendly(upErr.message.includes('mime') ? 'That file type isn\'t supported. Use JPG/PNG for photos and MP4/MOV for videos.' : upErr)); return; }
    const { data: status, error } = await sb.rpc('set_my_media', { p_kind: kind, p_path: path, p_seconds: secs });
    setBusy(null);
    if (error) { setError(friendly(error)); return; }
    if (kind === 'photo') setPhotoPath(path); else { setVideoPath(path); setSeconds(secs); }
    if (!draft && status === 'pending') setSentBack(true);
  }

  async function submit() {
    setBusy('submit');
    setError(null);
    const sb = supabaseBrowser();
    const { error: pErr } = await sb.rpc('set_my_prompts', { p_prompt4: p4, p_prompt5: p5 });
    if (pErr) { setBusy(null); setError(friendly(pErr)); return; }
    const res = await fetch('/api/submit', { method: 'POST' });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); setError(friendly(out.error ?? 'Could not submit.')); return; }
    window.location.href = '/status';
  }

  const needs = initial.decision_items ?? {};
  const backHref = live ? '/me' : draft ? '/join/details' : '/status';

  return (
    <main className="app">
      {draft ? <StepHeader step={3} back={backHref} /> : <a href={backHref} className="back" aria-label="Back"><Back /></a>}
      <h1>Your photo and video</h1>
      <p className="muted">
        A moderator compares your video with your photo. Only approved members can ever see them, and only if you allow it.
      </p>

      {initial.status === 'rejected' && !sentBack && (
        <div className="notice notice-amber">
          Upload {needs.photo === 'needs_update' && needs.video === 'needs_update' ? 'a new photo and video' : needs.video === 'needs_update' ? 'a new video' : 'a new photo'}.
          It goes straight back to our team for review.
        </div>
      )}
      {live && !sentBack && (
        <div className="notice notice-info"><Info /> Replacing your photo or video sends your profile back for review. You&apos;ll be hidden until it&apos;s approved again.</div>
      )}

      <div className="media-row">
        <label className={`media-tile media-photo ${busy === 'photo' ? 'busy' : ''}`}>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick('photo', e.target.files?.[0])} disabled={!!busy} />
          {photo.url && <img src={photo.url} alt="Your photo" />}
          {busy === 'photo' ? <Spinner /> : photoPath ? <span className="overlay">Photo added</span> : <><Person size={30} /> Add a photo</>}
        </label>
        <label className="media-tile media-video">
          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" capture="user" onChange={(e) => pick('video', e.target.files?.[0])} disabled={!!busy} />
          {video.url && <video src={video.url} muted playsInline preload="metadata" />}
          {busy === 'video' ? <Spinner /> : videoPath
            ? <span className="overlay">Video added{seconds ? ` · ${duration(seconds)}` : ''}</span>
            : <><span className="rec" /> Record 2–5 minutes</>}
        </label>
      </div>
      <div className="row between wrap small">
        <button type="button" className="link-btn" onClick={() => loadSample('photo')} disabled={!!busy}>Use a sample photo</button>
        <button type="button" className="link-btn" onClick={() => loadSample('video')} disabled={!!busy}>Use a sample video</button>
      </div>

      <div className="card stack">
        <strong style={{ color: 'var(--navy)' }}>Please answer these five prompts</strong>
        <div className="prompt-list">
          {FIXED_PROMPTS.map((p, i) => <div key={p}><span className="num">{i + 1}</span>{p}</div>)}
          {[[p4, setP4, p5], [p5, setP5, p4]].map(([val, setter, other], i) => (
            <div key={i}>
              <span className="num amber">{i + 4}</span>
              <select className="select" value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} aria-label={`Prompt ${i + 4}`}>
                <option value="">Choose a prompt…</option>
                {CHOICE_PROMPTS.filter((c) => c !== other).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="notice notice-info">
        <Info />
        <span>Please speak a little in every language you listed: {listJoin(initial.languages)}. They will appear as tags on your profile.</span>
      </div>
      <p className="small muted center">Tap the photo or video to change it.</p>
      <p className="demo-note">Demo: clips up to 50 MB. A short sample video is fine for trying the flow.</p>

      {error && <p className="err" role="alert">{error}</p>}

      {draft && (
        <button className="btn btn-primary" disabled={!photoPath || !videoPath || !p4 || !p5 || !!busy} onClick={submit}>
          {busy === 'submit' ? <Spinner /> : 'Submit for review'}
        </button>
      )}
      {!draft && sentBack && (
        <div className="stack">
          <div className="notice notice-sage">Thank you. Your profile is back with our team for review.</div>
          <a className="btn btn-primary" href="/status">Done</a>
        </div>
      )}
      {!draft && !sentBack && <a className="btn btn-outline" href={backHref}>Done</a>}

      {confirm && (
        <Sheet onClose={() => setConfirm(null)} label="Send back for review?">
          <h2>Send your profile back for review?</h2>
          <p className="muted">
            Changing your {confirm.kind} hides your profile from other members until a moderator approves it again. This usually takes up to 2 days.
          </p>
          <button className="btn btn-primary" onClick={() => upload(confirm.kind, confirm.file)}>Replace {confirm.kind} and send for review</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep my current {confirm.kind}</button>
        </Sheet>
      )}
    </main>
  );
}
