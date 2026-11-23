'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { COUNTRIES, FAITH_OPTIONS, LANGUAGES, ageFromDob, friendly } from '@/lib/shared';
import { Spinner } from '@/components/ui';
import { Back, Close } from '@/components/icons';

export function StepHeader({ step, back }: { step: number; back: string }) {
  return (
    <div className="row" style={{ gap: 14 }}>
      <Link href={back} className="back" aria-label="Back"><Back /></Link>
      <div className="grow stack" style={{ gap: 6 }}>
        <span className="small muted">Step {step} of 3</span>
        <div className="progress"><div style={{ width: `${(step / 3) * 100}%` }} /></div>
      </div>
    </div>
  );
}

export function JoinForm() {
  const [f, setF] = useState({
    email: '', password: '', first_name: '', last_name: '', dob: '', country: 'Spain', city: '',
    faith: '', languages: [] as string[],
  });
  const [consentAge, setConsentAge] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentFaith, setConsentFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const age = f.dob ? ageFromDob(f.dob) : null;
  const under18 = age !== null && age < 18;
  const maxDob = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const canContinue = f.email && f.password.length >= 8 && f.first_name && f.dob && !under18 && f.city &&
    f.languages.length > 0 && consentAge && consentTerms;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    setBusy(true);
    setError(null);
    const code = COUNTRIES.find(([n]) => n === f.country)?.[1] ?? '';
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...f, country_code: code, faith: consentFaith ? f.faith || null : null,
        consent_age: consentAge, consent_terms: consentTerms, consent_faith: consentFaith,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(friendly(out.error ?? 'Could not create the account.')); return; }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
    if (error) { setBusy(false); setError(friendly(error)); return; }
    window.location.href = '/join/details';
  }

  return (
    <main className="app">
      <StepHeader step={1} back="/" />
      <h1>About you</h1>
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="grid-2">
          <label className="field">
            <span>First name</span>
            <input className="input" required autoComplete="given-name" value={f.first_name} onChange={set('first_name')} maxLength={40} />
          </label>
          <label className="field">
            <span>Date of birth</span>
            <input className={`input ${under18 ? 'bad' : ''}`} type="date" required max={maxDob} value={f.dob} onChange={set('dob')} />
          </label>
        </div>
        {under18 && <p className="notice notice-danger" role="alert">You must be 18 or older to join. We can&apos;t create an account for you.</p>}
        <label className="field">
          <span>Last name <span className="faint">(only our team sees this)</span></span>
          <input className="input" autoComplete="family-name" value={f.last_name} onChange={set('last_name')} maxLength={40} />
        </label>
        <div className="field">
          <span>Country and city</span>
          <div className="grid-2">
            <select className="select" value={f.country} onChange={set('country')} aria-label="Country">
              {COUNTRIES.map(([n]) => <option key={n}>{n}</option>)}
            </select>
            <input className="input" placeholder="City" aria-label="City" value={f.city} onChange={set('city')} maxLength={60} />
          </div>
        </div>
        <label className="field">
          <span>Faith background</span>
          <select className="select" value={f.faith} onChange={set('faith')}>
            <option value="">[Your faith options]</option>
            {FAITH_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Languages you speak</span>
          <div className="row wrap">
            {f.languages.map((l) => (
              <span className="lang-chip" key={l}>
                {l}
                <button type="button" aria-label={`Remove ${l}`} onClick={() => setF({ ...f, languages: f.languages.filter((x) => x !== l) })}><Close size={16} /></button>
              </span>
            ))}
            <select className="chip chip-add" value="" aria-label="Add a language"
              onChange={(e) => e.target.value && setF({ ...f, languages: [...f.languages, e.target.value] })}>
              <option value="">+ Add</option>
              {LANGUAGES.filter((l) => !f.languages.includes(l)).map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <p className="small muted">About 15 more questions follow on the next step (full list from you).</p>

        <div className="card stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ marginBottom: 6 }}>Your sign-in</span>
          <div className="stack">
            <input className="input" type="email" placeholder="Email" aria-label="Email" autoComplete="email" value={f.email} onChange={set('email')} />
            <input className="input" type="password" placeholder="Password (8+ characters)" aria-label="Password" autoComplete="new-password" value={f.password} onChange={set('password')} />
          </div>
        </div>

        <div className="card stack" style={{ gap: 16 }}>
          <label className="check"><input type="checkbox" checked={consentAge} onChange={(e) => setConsentAge(e.target.checked)} /> I confirm I am 18 or older</label>
          <label className="check"><input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} />
            <span>I accept the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a></span></label>
          <label className="check"><input type="checkbox" checked={consentFaith} onChange={(e) => setConsentFaith(e.target.checked)} />
            <span>I agree that my faith-related answers may be stored and shown on my profile <span className="muted">(optional, separate consent)</span></span></label>
        </div>
        {!consentFaith && f.faith && <p className="small muted">Without the faith consent, your faith background is not stored.</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={!canContinue || busy}>{busy ? <Spinner /> : 'Continue'}</button>
        <p className="small muted center">Each consent is recorded with the date and version.</p>
      </form>
    </main>
  );
}
