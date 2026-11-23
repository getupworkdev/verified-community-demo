'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BRAND, REPORT_REASONS, friendly } from '@/lib/shared';
import { Ban, Chat, Compass, Person, Star } from './icons';

export function Brand({ mark = false }: { mark?: boolean }) {
  return (
    <span className="brand">
      {mark && <span className="brand-mark">+</span>}
      {BRAND}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Loading() {
  return <div className="loading-block"><Spinner /></div>;
}

// Signs a private storage path with the viewer's own session. The storage
// policy decides; the link expires after 5 minutes.
export const SIGNED_SECONDS = 300;
export function useSigned(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    if (!path) { setUrl(null); return; }
    const { data } = await supabaseBrowser().storage.from('media').createSignedUrl(path, SIGNED_SECONDS);
    setUrl(data?.signedUrl ?? null);
    setExpiresAt(Date.now() + SIGNED_SECONDS * 1000);
  }, [path]);
  useEffect(() => { refresh(); }, [refresh]);
  return { url, expiresAt, refresh };
}

export function Avatar({ name, hue = 0, size = 48, path }: { name: string; hue?: number; size?: number; path?: string | null }) {
  const { url } = useSigned(path);
  return (
    <span className={`avatar hue-${hue}`} style={{ width: size, height: size, fontSize: size * 0.46 }}>
      {name.replace(/^Pastor /, '').charAt(0)}
      {url && <img src={url} alt="" />}
    </span>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show: setMsg, node };
}

export function BottomNav() {
  const path = usePathname();
  const [requests, setRequests] = useState(0);
  useEffect(() => {
    supabaseBrowser().rpc('my_conversations').then(({ data }) => {
      setRequests((data ?? []).filter((c: { state: string }) => c.state === 'received').length);
    });
  }, [path]);
  const items = [
    { href: '/discover', label: 'Discover', icon: <Compass /> },
    { href: '/messages', label: 'Messages', icon: <Chat />, badge: requests },
    { href: '/membership', label: 'Membership', icon: <Star /> },
    { href: '/me', label: 'Me', icon: <Person /> },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={path === i.href || path.startsWith(`${i.href}/`) ? 'active' : ''}>
            {i.icon}
            {i.label}
            {!!i.badge && <span className="dot">{i.badge}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}

export function BlockReportSheet({ member, onClose }: { member: { id: string; first_name: string }; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'block' | 'report') {
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error } = kind === 'block'
      ? await sb.rpc('block_member', { p_id: member.id })
      : await sb.rpc('report_member', { p_id: member.id, p_reason: reason, p_details: details, p_block: true });
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    router.replace(`/discover?notice=${kind === 'block' ? 'blocked' : 'reported'}`);
  }

  return (
    <Sheet onClose={onClose} label={`Block or report ${member.first_name}`}>
      <h2>Block or report {member.first_name}</h2>
      <button className="card row" style={{ textAlign: 'left', cursor: 'pointer', gap: 14 }} disabled={busy} onClick={() => act('block')}>
        <Ban />
        <span className="stack" style={{ gap: 2 }}>
          <strong style={{ fontSize: 17 }}>Block</strong>
          <span className="small muted">You&apos;ll disappear from each other completely. They aren&apos;t told.</span>
        </span>
      </button>
      <strong style={{ color: 'var(--navy)' }}>Report a concern</strong>
      <div className="radio-list" role="radiogroup">
        {REPORT_REASONS.map(([code, label]) => (
          <label key={code}>
            <input type="radio" name="reason" value={code} checked={reason === code} onChange={() => setReason(code)} />
            {label}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Anything else we should know? (optional)</span>
        <textarea className="textarea" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
      </label>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-danger" disabled={!reason || busy} onClick={() => act('report')}>
        {busy ? <Spinner /> : 'Send report and block'}
      </button>
      <p className="tiny muted center">Our team reviews every report. Profiles with 3 reports are hidden until reviewed.</p>
    </Sheet>
  );
}
