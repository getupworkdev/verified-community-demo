import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { JoinForm } from './JoinForm';

export default async function Join() {
  const s = await getMyStatus();
  if (s.signed_in && (s.staff || s.profile)) redirect(homeFor(s));
  return <JoinForm />;
}
