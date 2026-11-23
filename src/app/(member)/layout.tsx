import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { BottomNav } from '@/components/ui';

// Only approved, visible members get past this point. The database applies
// the same rule independently, so this is a convenience, not the protection.
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const s = await getMyStatus();
  if (!s.signed_in) redirect('/login');
  if (s.status !== 'approved') redirect(homeFor(s));
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
