'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { dayLabel, fmtTime, friendly } from '@/lib/shared';
import { Avatar, BlockReportSheet, Loading } from '@/components/ui';
import { Back, Check, Dots, Send } from '@/components/icons';

type Conversation = {
  id: string; state: 'accepted' | 'sent' | 'received'; responded_at: string | null; requested_by_me: boolean;
  other: { id: string; first_name: string; hue: number; city: string; photo_path: string | null };
  messages: { id: number; mine: boolean; body: string; at: string }[];
};

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Conversation | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc('get_conversation', { p_id: id });
    setC((data as Conversation) ?? null);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (c && c.messages.length !== count.current) {
      count.current = c.messages.length;
      end.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [c]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc('send_message', { p_conversation: id, p_body: text });
    setSending(false);
    if (error) { setError(friendly(error)); return; }
    setText('');
    load();
  }

  if (c === undefined) return <main className="app"><Loading /></main>;
  if (c === null) {
    return (
      <main className="app">
        <h1>Conversation unavailable</h1>
        <p className="muted">This conversation is no longer available.</p>
        <Link className="btn btn-primary" href="/messages">Back to messages</Link>
      </main>
    );
  }

  const other = c.other;
  return (
    <main className="app with-nav" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 14, margin: '0 -4px' }}>
        <button className="back" onClick={() => router.push('/messages')} aria-label="Back"><Back /></button>
        <Link href={`/members/${other.id}`} className="row grow" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Avatar name={other.first_name} hue={other.hue} size={46} path={other.photo_path} />
          <span className="stack" style={{ gap: 0 }}>
            <strong style={{ fontSize: 18 }}>{other.first_name}</strong>
            <span className="small" style={{ color: 'var(--sage-deep)' }}><Check size={13} /> Verified</span>
          </span>
        </Link>
        <button className="back" onClick={() => setMenu(true)} aria-label="Block or report"><Dots /></button>
      </div>

      <div className="stack" style={{ gap: 10, flex: 1 }}>
        {c.state === 'accepted' && (
          <span className="sys-pill">
            {c.requested_by_me ? `${other.first_name} accepted your request` : `You accepted ${other.first_name}'s request`} · {dayLabel(c.responded_at)}
          </span>
        )}
        {c.messages.map((m, i) => {
          const showDay = i === 0 || dayLabel(c.messages[i - 1].at) !== dayLabel(m.at);
          return (
            <div key={m.id} className="stack" style={{ gap: 10 }}>
              {showDay && i > 0 && <span className="sys-pill">{dayLabel(m.at)}</span>}
              <div className={`bubble ${m.mine ? 'me' : 'them'}`} title={fmtTime(m.at)}>{m.body}</div>
            </div>
          );
        })}
        {c.messages.length > 0 && (
          <span className="tiny muted" style={{ alignSelf: 'flex-end' }}>{fmtTime(c.messages[c.messages.length - 1].at)}</span>
        )}
        {c.state === 'sent' && <div className="notice notice-info">Waiting for {other.first_name} to accept your request.</div>}
        <div ref={end} />
      </div>

      {c.state === 'accepted' && (
        <form className="composer" onSubmit={send}>
          <textarea className="textarea" rows={1} placeholder="Write a message…" value={text} maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message" />
          <button className="send-btn" disabled={!text.trim() || sending} aria-label="Send"><Send /></button>
        </form>
      )}
      {error && <p className="err">{error}</p>}
      <p className="tiny muted center">Messages are screened for abuse. Never share money or bank details.</p>
      {menu && <BlockReportSheet member={other} onClose={() => setMenu(false)} />}
    </main>
  );
}
