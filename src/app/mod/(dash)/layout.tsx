import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { BodyClass } from '@/components/ui';
import { ModTop } from './ModTop';

export default async function ModLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/mod/login');
  const { data: staff } = await supabase.rpc('staff_me');
  if (!staff) redirect('/mod/login');
  return (
    <>
      <BodyClass name="staff" />
      <ModTop name={staff.display_name} role={staff.role} />
      {children}
    </>
  );
}
