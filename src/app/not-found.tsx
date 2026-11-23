import Link from 'next/link';
import { Brand } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="app">
      <Brand />
      <div className="stack" style={{ marginTop: 48 }}>
        <span className="section-label">404</span>
        <h1>This page isn&apos;t available</h1>
        <p className="muted">The profile may be private, under review, or no longer part of the community.</p>
      </div>
      <Link className="btn btn-primary" href="/">Go to the start</Link>
    </main>
  );
}
