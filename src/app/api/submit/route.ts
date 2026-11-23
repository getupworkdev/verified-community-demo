import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

// Submits the caller's own profile for review (as the member, under RLS),
// then records the country of the submitting request's IP for moderators.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const { data, error } = await supabase.rpc('submit_for_review');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const detected = req.headers.get('x-vercel-ip-country');
  if (detected) await supabaseAdmin().from('profiles').update({ detected_country: detected }).eq('id', user.id);
  return NextResponse.json({ status: data });
}
