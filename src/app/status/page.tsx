import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { StatusView } from './StatusView';

export default async function Status() {
  const s = await getMyStatus();
  if (!s.signed_in || s.staff || !s.profile || s.status === 'approved' || s.status === 'draft') redirect(homeFor(s));
  return <StatusView s={s} />;
}
