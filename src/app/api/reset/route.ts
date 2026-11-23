import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { resetDemo } from '@/lib/reset';

// Staff-only. The caller's own session proves they are staff (checked in the
// database); only then does the server use its service key to restore the seed.
export async function POST() {
  const supabase = await supabaseServer();
  const { data: isStaff } = await supabase.rpc('is_staff');
  if (!isStaff) return NextResponse.json({ error: 'staff_only' }, { status: 403 });
  try {
    await resetDemo(supabaseAdmin());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
