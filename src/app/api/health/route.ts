import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Daily keep-alive (Vercel cron): a real database query so the free-tier
// project is never paused for inactivity.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin().rpc('health');
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, profiles: data });
}
