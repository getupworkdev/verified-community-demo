import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { DetailsForm } from './DetailsForm';

export default async function Details() {
  const s = await getMyStatus();
  if (!s.signed_in || s.staff || !s.profile || s.status === 'suspended' || s.status === 'banned') redirect(homeFor(s));
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('profiles').select('about, community, looking_for, answers, status').eq('id', s.id!).single();
  return <DetailsForm initial={p!} />;
}
