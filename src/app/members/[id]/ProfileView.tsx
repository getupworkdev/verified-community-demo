'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { duration, friendly } from '@/lib/shared';
import { BlockReportSheet, Sheet, Spinner, useSigned } from '@/components/ui';
import { Back, Check, Dots, Lock, Play } from '@/components/icons';

export type MemberProfile = {
  id: string; first_name: string; age: number; city: string; country: string; languages: string[];
  faith: string | null; about: string; community: string; looking_for: string;
  photo_path: string | null; video_path: string | null; video_seconds: number | null;
  photo_locked: boolean; video_locked: boolean; conversation_id: string | null;
  conversation_state: 'none' | 'sent' | 'received' | 'accepted'; hue: number;
};

export function ProfileView({ m }: { m: MemberProfile }) {
  const router = useRouter();
  const photo = useSigned(m.photo_path);
  const [playing, setPlaying] = useState(false);
  const video = useSigned(playing ? m.video_path : null);
  const [menu, setMenu] = useState(false);
  const [compose, setCompose] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState(m.conversation_state);
  const name = m.first_name;

  async function startRequest() {
    setBusy(true);
    const { data } = await supabaseBrowser().rpc('membership_info');
    setBusy(false);
    if (data?.active) setCompose(true);
    else router.push(`/membership?from=${m.id}`);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc('send_request', { p_to: m.id, p_body: text });
    setBusy(false);
    if (error) {
      if (error.message.includes('membership_required')) { router.push(`/membership?from=${m.id}`); return; }
      setError(friendly(error));
      return;
    }
    setCompose(false);
    setState('sent');
  }

  return (
    <main className="app with-nav">
      <div className={`hero hue-${m.hue}`}>
        <button className="hero-btn" style={{ left: 18 }} onClick={() => (history.length > 1 ? router.back() : router.push('/discover'))} aria-label="Back"><Back /></button>
        <button className="hero-btn" style={{ right: 18 }} onClick={() => setMenu(true)} aria-label="Block or report"><Dots /></button>
        {m.first_name.replace(/^Pastor /, '').charAt(0)}
        {photo.url && <img src={photo.url} alt={`${name}'s photo`} />}
        {m.photo_locked && <span className="lock-note"><Lock size={16} /> Photo shared once you&apos;re connected</span>}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="row between wrap">
          <h1>{name}, {m.age}</h1>
          <span className="pill pill-sage"><Check size={15} /> Verified by video</span>
        </div>
        <span className="muted">{m.city}, {m.country}</span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {m.languages.map((l) => <span key={l} className="pill pill-blue">{l}</span>)}
        {m.faith && <span className="pill pill-amber">{m.faith}</span>}
      </div>

      {m.video_locked ? (
        <div className="video-bar locked"><span className="play"><Lock size={18} /></span>Introduction video shared once you&apos;re connected</div>
      ) : playing && video.url ? (
        <video className="player" src={video.url} controls autoPlay playsInline onError={() => video.refresh()} />
      ) : (
        <button className="video-bar" onClick={() => setPlaying(true)}>
          <span className="play">{playing ? <Spinner /> : <Play />}</span>
          Watch {name}&apos;s introduction{m.video_seconds ? ` · ${duration(m.video_seconds)}` : ''}
        </button>
      )}

      {m.about && (
        <div className="stack" style={{ gap: 6 }}>
          <strong style={{ color: 'var(--navy)' }}>About me</strong>
          <p className="muted" style={{ fontSize: 17 }}>{m.about}</p>
        </div>
      )}
      <div className="grid-2">
        <div className="card" style={{ padding: '12px 16px' }}><div className="small muted">Community</div><strong>{m.community || '[Field]'}</strong></div>
        <div className="card" style={{ padding: '12px 16px' }}><div className="small muted">Looking for</div><strong>{m.looking_for}</strong></div>
      </div>

      <div className="stack mt-auto">
        {state === 'none' && <button className="btn btn-primary" onClick={startRequest} disabled={busy}>Send a message request</button>}
        {state === 'sent' && <button className="btn btn-ghost" disabled>Request sent · waiting for {name}</button>}
        {state === 'received' && <Link className="btn btn-primary" href="/messages">{name} sent you a request · reply</Link>}
        {state === 'accepted' && m.conversation_id && <Link className="btn btn-primary" href={`/messages/${m.conversation_id}`}>Open conversation</Link>}
        {state === 'none' && <p className="small muted center">Starting a conversation needs a membership. Replying is always free.</p>}
      </div>

      {compose && (
        <Sheet onClose={() => setCompose(false)} label={`Message request to ${name}`}>
          <h2>Write to {name}</h2>
          <p className="small muted">{name} will see your message and can accept or decline. Declining is private.</p>
          <textarea className="textarea" autoFocus maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={`Hello ${name}, I enjoyed your introduction…`} />
          {error && <p className="err">{error}</p>}
          <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={send}>{busy ? <Spinner /> : 'Send request'}</button>
        </Sheet>
      )}
      {menu && <BlockReportSheet member={m} onClose={() => setMenu(false)} />}
    </main>
  );
}
