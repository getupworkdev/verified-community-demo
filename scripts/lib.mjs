import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export function loadEnv() {
  const file = new URL('../.env.local', import.meta.url);
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    seedPassword: process.env.SEED_PASSWORD,
  };
}

export const DEMO_LOGINS = {
  'anna@example.com': 'Anna-moderator-2026',
  'ruth@example.com': 'Ruth-demo-2026',
  'daniel@example.com': 'Daniel-demo-2026',
};

export const SEED_MEMBERS = [
  'ruth', 'david', 'james', 'samuel', 'mark', 'grace', 'thomas', 'elena', 'john',
  'sarah', 'tom', 'daniel', 'lucia', 'peter', 'paul', 'victor', 'kevin',
];
export const SEED_STAFF = ['anna', 'lucy'];
export const ALL_SEED_EMAILS = [...SEED_MEMBERS, ...SEED_STAFF].map((n) => `${n}@example.com`);

export function passwordFor(email, env) {
  return DEMO_LOGINS[email] ?? env.seedPassword;
}

export function adminClient(env) {
  return createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function allUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

// Restores the seed: removes uploads that are not seed files, then resets the tables.
export async function resetDemo(admin) {
  const users = await allUsers(admin);
  const seedIds = new Set(users.filter((u) => ALL_SEED_EMAILS.includes(u.email)).map((u) => u.id));
  const { data: folders, error } = await admin.storage.from('media').list('', { limit: 1000 });
  if (error) throw error;
  for (const f of folders) {
    const { data: files } = await admin.storage.from('media').list(f.name, { limit: 1000 });
    const remove = (files ?? [])
      .filter((x) => !seedIds.has(f.name) || !['photo-seed.jpg', 'video-seed.mp4'].includes(x.name))
      .map((x) => `${f.name}/${x.name}`);
    if (remove.length) await admin.storage.from('media').remove(remove);
  }
  const { error: rpcError } = await admin.rpc('reset_demo_data');
  if (rpcError) throw rpcError;
}
