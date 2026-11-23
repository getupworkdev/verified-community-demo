import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ageFromDob } from '@/lib/shared';

// Creates the login with the server-side service key (so no email code is
// needed in the demo), then creates the profile *as the new member* so the
// database's own checks (18+, consents) apply.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters for your password.' }, { status: 400 });
  if (!b.dob || !/^\d{4}-\d{2}-\d{2}$/.test(b.dob) || ageFromDob(b.dob) < 18) {
    return NextResponse.json({ error: 'under_18' }, { status: 400 });
  }
  if (!b.consent_age || !b.consent_terms) return NextResponse.json({ error: 'consent_required' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr || !created.user) {
    const taken = /already|exists|registered/i.test(createErr?.message ?? '');
    return NextResponse.json({ error: taken ? 'email_taken' : 'Could not create the account.' }, { status: taken ? 409 : 500 });
  }

  const asMember = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await asMember.auth.signInWithPassword({ email, password });
  const { error: profileErr } = signInErr
    ? { error: signInErr }
    : await asMember.rpc('create_my_profile', {
        p_first_name: String(b.first_name ?? '').slice(0, 40),
        p_last_name: String(b.last_name ?? '').slice(0, 40),
        p_dob: b.dob,
        p_country: String(b.country ?? ''),
        p_country_code: String(b.country_code ?? ''),
        p_city: String(b.city ?? '').slice(0, 60),
        p_faith: b.faith ? String(b.faith) : null,
        p_languages: Array.isArray(b.languages) ? b.languages.map(String).slice(0, 8) : [],
        p_consent_age: !!b.consent_age,
        p_consent_terms: !!b.consent_terms,
        p_consent_faith: !!b.consent_faith,
      });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  // Country from the request's IP (set by the hosting edge). Shown to moderators only.
  const detected = req.headers.get('x-vercel-ip-country');
  if (detected) await admin.from('profiles').update({ detected_country: detected }).eq('id', created.user.id);

  return NextResponse.json({ ok: true });
}
