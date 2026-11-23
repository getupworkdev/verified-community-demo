import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyStatus, homeFor } from '@/lib/session';
import { LoginForm } from '@/components/LoginForm';
import { Brand } from '@/components/ui';
import { Back } from '@/components/icons';

export default async function Login() {
  const s = await getMyStatus();
  if (s.signed_in) redirect(homeFor(s));
  return (
    <main className="app">
      <div className="row">
        <Link href="/" className="back" aria-label="Back"><Back /></Link>
        <Brand />
      </div>
      <h1>Welcome back</h1>
      <LoginForm
        staff={false}
        demos={[
          { label: 'Ruth · approved member', email: 'ruth@example.com', password: 'Ruth-demo-2026' },
          { label: 'Daniel · under review', email: 'daniel@example.com', password: 'Daniel-demo-2026' },
        ]}
      />
      <p className="small muted center">New here? <Link href="/join">Join the community</Link></p>
    </main>
  );
}
