import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const SEED = [
  'ruth', 'david', 'james', 'samuel', 'mark', 'grace', 'thomas', 'elena', 'john', 'sarah', 'tom',
  'daniel', 'lucia', 'peter', 'paul', 'victor', 'kevin', 'anna', 'lucy',
].map((n) => `${n}@example.com`);
const SEED_FILES = ['photo-seed.jpg', 'video-seed.mp4'];

export async function resetDemo(admin: SupabaseClient) {
  const seedIds = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.filter((u) => SEED.includes(u.email ?? '')).forEach((u) => seedIds.add(u.id));
    if (data.users.length < 200) break;
  }
  const { data: folders, error } = await admin.storage.from('media').list('', { limit: 1000 });
  if (error) throw error;
  await Promise.all(folders.map(async (f) => {
    const { data: files } = await admin.storage.from('media').list(f.name, { limit: 1000 });
    const remove = (files ?? [])
      .filter((x) => !seedIds.has(f.name) || !SEED_FILES.includes(x.name))
      .map((x) => `${f.name}/${x.name}`);
    if (remove.length) await admin.storage.from('media').remove(remove);
  }));
  const { error: rpcError } = await admin.rpc('reset_demo_data');
  if (rpcError) throw rpcError;
}
