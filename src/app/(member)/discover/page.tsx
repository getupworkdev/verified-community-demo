'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { friendly } from '@/lib/shared';
import { Loading, useSigned, useToast } from '@/components/ui';
import { Check, Lock, Search } from '@/components/icons';

type Member = {
  id: string; first_name: string; age: number; city: string; country: string; languages: string[];
  photo_path: string | null; photo_locked: boolean; hue: number;
};

const AGES: [string, number | null, number | null][] = [
  ['Any age', null, null], ['Age 18–29', 18, 29], ['Age 30–40', 30, 40], ['Age 35–45', 35, 45], ['Age 40+', 40, null],
];

function Tile({ m }: { m: Member }) {
  const { url } = useSigned(m.photo_path);
  return (
    <Link href={`/members/${m.id}`} className="tile">
      {m.photo_locked ? (
        <div className="tile-media tile-locked"><Lock /> Photo shared on request</div>
      ) : (
        <div className={`tile-media hue-${m.hue}`}>
          {m.first_name.replace(/^Pastor /, '').charAt(0)}
          {url && <img src={url} alt="" />}
        </div>
      )}
      <div className="tile-body">
        <strong>{m.first_name}, {m.age}</strong>
        <div className="small muted">{m.city} · {m.languages.join(', ')}</div>
      </div>
    </Link>
  );
}

function Discover() {
  const params = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [age, setAge] = useState(0);
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [opts, setOpts] = useState<{ countries: string[]; languages: string[] }>({ countries: [], languages: [] });
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = params.get('notice');
    if (n === 'blocked') toast.show("Blocked. You won't see each other again.");
    if (n === 'reported') toast.show('Thank you. Our team will review your report.');
    supabaseBrowser().rpc('discover_options').then(({ data }) => data && setOpts(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const [, min, max] = AGES[age];
      const { data, error } = await supabaseBrowser().rpc('discover', {
        p_min_age: min, p_max_age: max, p_country: country || null, p_language: language || null, p_search: q.trim() || null,
      });
      if (error) setError(friendly(error));
      else { setError(null); setMembers(data as Member[]); }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, age, country, language]);

  return (
    <main className="app with-nav wide">
      <div className="row between">
        <h1>Discover</h1>
        <span className="pill pill-sage"><Check size={15} /> Verified</span>
      </div>
      <label className="row input" style={{ gap: 10, color: 'var(--muted)' }}>
        <Search />
        <input style={{ border: 0, outline: 0, background: 'transparent', flex: 1, minWidth: 0 }} placeholder="Search by name or city"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name or city" />
      </label>
      <div className="row wrap" style={{ gap: 8 }}>
        <select className={`chip ${age ? 'on' : ''}`} value={age} onChange={(e) => setAge(Number(e.target.value))} aria-label="Age">
          {AGES.map(([l], i) => <option key={l} value={i}>{l}</option>)}
        </select>
        <select className={`chip ${country ? 'on' : ''}`} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">Any country</option>
          {opts.countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={`chip ${language ? 'on' : ''}`} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
          <option value="">Any language</option>
          {opts.languages.map((l) => <option key={l} value={l}>Speaks {l}</option>)}
        </select>
        {(age || country || language || q) ? (
          <button className="chip" style={{ borderStyle: 'dashed' }} onClick={() => { setAge(0); setCountry(''); setLanguage(''); setQ(''); }}>Clear</button>
        ) : null}
      </div>
      {error && <p className="err">{error}</p>}
      {!members ? <Loading /> : members.length === 0 ? (
        <div className="card center stack" style={{ padding: 32 }}>
          <strong>No members match these filters</strong>
          <span className="muted small">Try a wider age range or another country.</span>
        </div>
      ) : (
        <div className="tiles">{members.map((m) => <Tile key={m.id} m={m} />)}</div>
      )}
      <p className="demo-note">Everyone shown here has been approved by a moderator after a video check.</p>
      {toast.node}
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Discover /></Suspense>;
}
