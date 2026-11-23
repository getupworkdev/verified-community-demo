import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

// The shared demo logins are kept so every visitor gets the same walkthrough.
const PROTECTED = ['ruth@example.com', 'daniel@example.com', 'anna@example.com', 'lucy@example.com'];

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (PROTECTED.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Shared demo accounts can\'t be deleted. Create your own account from the welcome screen to try deleting it.' }, { status: 403 });
  }
  const admin = supabaseAdmin();
  const { data: files } = await admin.storage.from('media').list(user.id, { limit: 1000 });
  if (files?.length) await admin.storage.from('media').remove(files.map((f) => `${user.id}/${f.name}`));
  await admin.from('audit_log').insert({ actor_name: 'System', action: 'deleted an account at the member\'s request', target_id: user.id });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: 'Could not delete the account.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
