'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ago, friendly } from '@/lib/shared';
import { Avatar, Loading, Spinner } from '@/components/ui';
import { Check } from '@/components/icons';

type Conv = {
  id: string; other_id: string; other_name: string; other_age: number; other_city: string; other_hue: number;
  state: 'sent' | 'received' | 'accepted'; last_body: string; last_at: string; last_from_me: boolean;
};

export default function Messages() {
  const router = useRouter();
  const [list, setList] = useState<Conv[] | null>(null);
  const [tab, setTab] = useState<'requests' | 'conversations' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc('my_conversations');
    if (error) { setError(friendly(error)); return; }
    setList(data as Conv[]);
    setTab((t) => t ?? ((data as Conv[]).some((c) => c.state === 'received') ? 'requests' : 'conversations'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function respond(c: Conv, accept: boolean) {
    setBusy(c.id + accept);
    const { error } = await supabaseBrowser().rpc('respond_request', { p_conversation: c.id, p_accept: accept });
    setBusy(null);
    if (error) { setError(friendly(error)); return; }
    if (accept) router.push(`/messages/${c.id}`);
    else load();
  }

  const requests = (list ?? []).filter((c) => c.state === 'received');
  const convs = (list ?? []).filter((c) => c.state !== 'received');

  return (
    <main className="app with-nav">
      <h1>Messages</h1>
      <div className="tabs" role="tablist">
        <button role="tab" className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests{requests.length ? ` · ${requests.length}` : ''}</button>
        <button role="tab" className={tab === 'conversations' ? 'on' : ''} onClick={() => setTab('conversations')}>Conversations</button>
      </div>
      {error && <p className="err">{error}</p>}
      {!list ? <Loading /> : tab === 'requests' ? (
        <>
          {requests.length === 0 && <div className="card center muted">No new requests.</div>}
          {requests.map((c) => (
            <div className="card stack" key={c.id} style={{ gap: 14 }}>
              <div className="row" style={{ gap: 14 }}>
                <Avatar name={c.other_name} hue={c.other_hue} size={56} />
                <div className="grow">
                  <strong style={{ fontSize: 18 }}>{c.other_name}, {c.other_age}</strong>
                  <div className="small muted">{c.other_city} · <Check size={13} /> Verified</div>
                </div>
                <span className="small muted">{ago(c.last_at)}</span>
              </div>
              <p className="muted">&ldquo;{c.last_body}&rdquo;</p>
              <div className="grid-2">
                <button className="btn btn-primary" disabled={!!busy} onClick={() => respond(c, true)}>{busy === c.id + true ? <Spinner /> : 'Accept'}</button>
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => respond(c, false)}>{busy === c.id + false ? <Spinner /> : 'Decline'}</button>
              </div>
              <Link href={`/members/${c.other_id}`} className="small" style={{ alignSelf: 'flex-start' }}>View {c.other_name}&apos;s profile</Link>
            </div>
          ))}
          <p className="small muted center">Declining is private: the other person isn&apos;t told. We email you when a new request arrives.</p>
        </>
      ) : (
        <div className="list">
          {convs.length === 0 && <div className="list-row muted">No conversations yet. Accept a request or send one from a profile.</div>}
          {convs.map((c) => (
            <Link key={c.id} href={c.state === 'accepted' ? `/messages/${c.id}` : `/members/${c.other_id}`} className="list-row" style={{ textDecoration: 'none' }}>
              <Avatar name={c.other_name} hue={c.other_hue} size={48} />
              <div className="grow">
                <div className="row between"><strong>{c.other_name}</strong><span className="tiny muted">{ago(c.last_at)}</span></div>
                <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.state === 'sent' ? 'Request sent · waiting for a reply' : `${c.last_from_me ? 'You: ' : ''}${c.last_body}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
