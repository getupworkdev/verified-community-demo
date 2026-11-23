import 'server-only';
import { supabaseServer } from './supabase/server';

export type MyStatus = {
  signed_in: boolean;
  staff?: boolean;
  profile?: boolean;
  id?: string;
  first_name?: string;
  status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'banned' | 'hidden';
  reason?: string | null;
  items?: Record<string, string>;
  suspended_until?: string | null;
  appeal_requested_at?: string | null;
  has_photo?: boolean;
  has_video?: boolean;
  has_prompts?: boolean;
};

export async function getMyStatus(): Promise<MyStatus> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { signed_in: false };
  const { data } = await supabase.rpc('my_status');
  return (data as MyStatus) ?? { signed_in: false };
}

// Where a signed-in person belongs right now.
export function homeFor(s: MyStatus): string {
  if (!s.signed_in) return '/';
  if (s.staff) return '/mod';
  if (!s.profile) return '/join';
  if (s.status === 'approved') return '/discover';
  if (s.status === 'draft') return s.has_photo && s.has_video ? '/join/media' : '/join/details';
  return '/status';
}
