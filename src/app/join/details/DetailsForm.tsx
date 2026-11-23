'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { friendly } from '@/lib/shared';
import { Spinner } from '@/components/ui';
import { StepHeader } from '../JoinForm';
import { Back } from '@/components/icons';

type Initial = { about: string; community: string; looking_for: string; answers: Record<string, string>; status: string };

const QUESTIONS: { key: string; label: string; options: string[] }[] = [
  { key: 'church_attendance', label: 'How often do you attend services?', options: ['Weekly', 'A few times a month', 'Occasionally'] },
  { key: 'children', label: 'Do you have children?', options: ['No', 'Yes', 'Prefer to say later'] },
  { key: 'relocate', label: 'Would you relocate for the right person?', options: ['Yes', 'Open to it', 'No'] },
];

export function DetailsForm({ initial }: { initial: Initial }) {
  const editing = initial.status !== 'draft';
  const [about, setAbout] = useState(initial.about ?? '');
  const [community, setCommunity] = useState(initial.community ?? '');
  const [looking, setLooking] = useState(initial.looking_for ?? 'Marriage');
  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc('update_my_details', {
      p_about: about, p_community: community, p_looking_for: looking, p_answers: answers,
    });
    if (error) { setBusy(false); setError(friendly(error)); return; }
    window.location.href = editing ? (initial.status === 'approved' ? '/me' : '/status') : '/join/media';
  }

  return (
    <main className="app">
      {editing
        ? <a href={initial.status === 'approved' ? '/me' : '/status'} className="back" aria-label="Back"><Back /></a>
        : <StepHeader step={2} back="/join" />}
      <h1>{editing ? 'Edit your profile' : 'Your profile'}</h1>
      <form className="stack-lg" onSubmit={save}>
        <label className="field">
          <span>About me</span>
          <textarea className="textarea" maxLength={600} value={about} onChange={(e) => setAbout(e.target.value)}
            placeholder="A few lines about your life, your faith and what matters to you." />
          <span className="tiny faint" style={{ alignSelf: 'flex-end' }}>{about.length}/600</span>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Community</span>
            <input className="input" maxLength={80} value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="[Field]" />
          </label>
          <label className="field">
            <span>Looking for</span>
            <select className="select" value={looking} onChange={(e) => setLooking(e.target.value)}>
              <option>Marriage</option><option>Friendship first</option><option>Not sure yet</option>
            </select>
          </label>
        </div>
        {QUESTIONS.map((q) => (
          <label className="field" key={q.key}>
            <span>{q.label}</span>
            <select className="select" value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}>
              <option value="">Choose…</option>
              {q.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        ))}
        <div className="notice notice-info">The full questionnaire (about 15 questions) goes here once you send the list.</div>
        {error && <p className="err">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : editing ? 'Save changes' : 'Continue'}</button>
        {editing && <p className="small muted center">Text changes save straight away. Changing your photo or video sends your profile back for review.</p>}
      </form>
    </main>
  );
}
