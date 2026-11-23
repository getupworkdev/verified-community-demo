import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { MediaForm } from './MediaForm';

export default async function Media() {
  const s = await getMyStatus();
  if (!s.signed_in || s.staff || !s.profile || ['suspended', 'banned', 'hidden'].includes(s.status ?? '')) redirect(homeFor(s));
  const supabase = await supabaseServer();
  const { data: p } = await supabase
    .from('profiles')
    .select('id, first_name, status, photo_path, video_path, video_seconds, prompt4, prompt5, languages, decision_items')
    .eq('id', s.id!)
    .single();
  return <MediaForm initial={p!} />;
}
