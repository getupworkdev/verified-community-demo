'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BRAND } from '@/lib/shared';

export type Counts = { new: number; changed: number; flagged: number; queue: number; reports: number; hidden: number; flagged_messages: number };

// Pages call this after an action so the header counts stay current.
export function refreshCounts() {
  window.dispatchEvent(new Event('mod-counts'));
}

export function ModTop({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  const [c, setC] = useState<Counts | null>(null);
  useEffect(() => {
    const load = () => supabaseBrowser().rpc('mod_counts').then(({ data }) => setC(data));
    load();
    window.addEventListener('mod-counts', load);
    return () => window.removeEventListener('mod-counts', load);
  }, [path]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = '/mod/login';
  }

  const links = [
    ['/mod', `Review queue${c ? ` · ${c.queue}` : ''}`],
    ['/mod/reports', `Reports${c ? ` · ${c.reports}` : ''}`],
    ['/mod/members', 'Members'],
  ];
  return (
    <header className="mod-top">
      <span className="title">{BRAND} · {role === 'admin' ? 'Admin' : 'Moderation'}</span>
      <nav>
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>
        ))}
      </nav>
      <div className="who">
        <span>{name} ({role === 'admin' ? 'moderator · admin' : 'moderator'})</span>
        <button onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
