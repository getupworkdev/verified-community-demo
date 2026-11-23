import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { BottomNav } from '@/components/ui';
import { ProfileView, type MemberProfile } from './ProfileView';

// A profile URL answers 404 whenever the database says the viewer may not see
// this member: pending, rejected, hidden, suspended, blocked, unknown, or the
// viewer is not approved themselves. The page never decides this on its own.
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase.rpc('get_member', { p_id: id });
  const m = (data as MemberProfile[] | null)?.[0];
  if (!m) notFound();
  return (
    <>
      <ProfileView m={m} />
      <BottomNav />
    </>
  );
}
